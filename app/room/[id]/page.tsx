"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getSession,
  updateSession,
  subscribeToSession,
  calculateTotals,
  Session,
  LineItem,
  getAssignments,
  getItemShare,
} from "@/lib/session";
import { getLocalUser, getLocalUserForRoom, setLocalUserForRoom, addRoomToLocalHistory } from "@/lib/identity";
import { AnimalAvatar } from "@/components/AnimalAvatar";
import clsx from "clsx";
import { QRCodeSVG } from "qrcode.react";

type Tab = "split" | "pay";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("split");
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "tng" | "other" | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Add missing item state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);

  const [selectForFriend, setSelectForFriend] = useState<string | null>(null);
  const [activeParticipantMenu, setActiveParticipantMenu] = useState<string | null>(null);

  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState("");
  const [friendLinkCopied, setFriendLinkCopied] = useState<string | null>(null);

  // QR Modal State
  const [showShareQR, setShowShareQR] = useState(false);

  // Mutation lock and debounce
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);
  const isMutating = useRef(false);

  // Per-room identity
  const roomUser = getLocalUserForRoom(id);
  const legacyUser = getLocalUser();
  const myName = roomUser?.name || legacyUser?.name || "";

  // Load + subscribe
  useEffect(() => {
    if (!myName) {
      // No identity for this room — redirect to join page
      getSession(id).then((s) => {
        if (s) {
          router.push(`/join/${s.code}`);
        } else {
          router.push("/");
        }
      });
      return;
    }

    getSession(id).then((s) => {
      if (!s) { router.push("/"); return; }
      if (s.status === "scanning") router.push(`/scan?session=${id}`);
      setSession(s);
      addRoomToLocalHistory(id);
    });

    // Supabase Realtime Subscription
    const channel = subscribeToSession(id, (updated) => {
      if (isMutating.current) return;
      setSession(updated);
    });

    // Fallback polling (in case Supabase Realtime is not enabled on the sessions table)
    const pollInterval = setInterval(() => {
      getSession(id).then((s) => {
        if (isMutating.current) return;
        if (s) setSession(s);
      });
    }, 3000);

    return () => {
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [id, myName, router]);

  const isOwner = session?.owner === myName;
  const effectiveName = myName;

  function debouncedUpdateSession(patch: Partial<Session>) {
    if (updateTimeout.current) clearTimeout(updateTimeout.current);
    isMutating.current = true;
    updateTimeout.current = setTimeout(async () => {
      try {
        await updateSession(id, patch);
      } finally {
        setTimeout(() => { isMutating.current = false; }, 1000);
      }
    }, 400);
  }

  async function setSplitMode(mode: "even" | "byItem") {
    if (!session || !isOwner) return; // only owner can change
    setSaving(true);
    const updated = { ...session, splitMode: mode };
    setSession(updated);
    await updateSession(id, { splitMode: mode });
    setSaving(false);
  }

  async function handleAddMissingItem() {
    if (!session || !newItemName.trim() || !newItemPrice) return;
    const price = parseFloat(newItemPrice);
    if (isNaN(price) || price < 0) return;

    setSaving(true);
    const newItem: LineItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: newItemName.trim(),
      quantity: newItemQty,
      price: price,
      assignedTo: { [effectiveName]: newItemQty },
      addedLater: true,
    };

    const items = [...session.items, newItem];
    const updated = { ...session, items };
    setSession(updated);
    await updateSession(id, { items });

    setIsAddingItem(false);
    setNewItemName("");
    setNewItemPrice("");
    setNewItemQty(1);
    setSaving(false);
  }

  async function toggleItemAssignment(itemId: string, targetName: string = effectiveName) {
    if (!session || session.splitMode !== "byItem") return;
    const item = session.items.find(i => i.id === itemId);
    if (!item) return;
    const targetParticipant = session.participants.find(p => p.name === targetName);
    // If target user has paid, they can only interact with addedLater items
    if (targetParticipant?.hasPaid && !item.addedLater) return;

    const items = session.items.map((item) => {
      if (item.id !== itemId) return item;
      const assignments = { ...getAssignments(item) };
      const currentClaim = assignments[targetName] || 0;

      const totalQty = item.quantity || 1;
      const totalClaimedOthers = Object.entries(assignments)
        .filter(([name]) => name !== targetName)
        .reduce((sum, [, qty]) => sum + qty, 0);
      const maxAvailableForMe = Math.max(0, totalQty - totalClaimedOthers);

      if (currentClaim === 0) {
        if (maxAvailableForMe > 0) {
          assignments[targetName] = 1;
        }
      } else {
        if (currentClaim < maxAvailableForMe) {
          assignments[targetName] = currentClaim + 1;
        } else {
          delete assignments[targetName];
        }
      }

      return {
        ...item,
        assignedTo: assignments,
      };
    });
    const updated = { ...session, items };
    setSession(updated);
    debouncedUpdateSession({ items });
  }

  async function adjustClaimedQuantity(itemId: string, delta: number, targetName: string = effectiveName) {
    if (!session || session.splitMode !== "byItem") return;
    const item = session.items.find(i => i.id === itemId);
    if (!item) return;
    const targetParticipant = session.participants.find(p => p.name === targetName);
    // If target user has paid, they can only interact with addedLater items
    if (targetParticipant?.hasPaid && !item.addedLater) return;
    const items = session.items.map((item) => {
      if (item.id !== itemId) return item;
      const assignments = { ...getAssignments(item) };
      const current = assignments[targetName] || 0;
      const next = current + delta;
      const totalClaimedOthers = Object.entries(assignments)
        .filter(([name]) => name !== targetName)
        .reduce((sum, [, qty]) => sum + qty, 0);
      const maxAvailableForMe = Math.max(0, item.quantity - totalClaimedOthers);

      if (next <= 0) {
        delete assignments[targetName];
      } else {
        assignments[targetName] = Math.min(next, maxAvailableForMe);
      }
      return {
        ...item,
        assignedTo: assignments,
      };
    });
    const updated = { ...session, items };
    setSession(updated);
    debouncedUpdateSession({ items });
  }

  async function claimRest(targetName: string = effectiveName) {
    if (!session || session.splitMode !== "byItem") return;
    const targetParticipant = session.participants.find(p => p.name === targetName);

    const items = session.items.map((item) => {
      // If target user has paid, they can only interact with addedLater items
      if (targetParticipant?.hasPaid && !item.addedLater) return item;

      const assignments = { ...getAssignments(item) };
      const totalQty = item.quantity || 1;
      const totalClaimed = Object.values(assignments).reduce((sum, qty) => sum + Number(qty), 0);

      const qtyLeft = totalQty - totalClaimed;
      if (qtyLeft > 0) {
        assignments[targetName] = (assignments[targetName] || 0) + qtyLeft;
      }
      return {
        ...item,
        assignedTo: assignments,
      };
    });

    const updated = { ...session, items };
    setSession(updated);
    debouncedUpdateSession({ items });
  }

  async function deselectAll(targetName: string = effectiveName) {
    if (!session || session.splitMode !== "byItem") return;
    const targetParticipant = session.participants.find(p => p.name === targetName);

    const items = session.items.map((item) => {
      // If target user has paid, they can only interact with addedLater items
      if (targetParticipant?.hasPaid && !item.addedLater) return item;

      const assignments = { ...getAssignments(item) };
      if (assignments[targetName] !== undefined) {
        delete assignments[targetName];
      }
      return {
        ...item,
        assignedTo: assignments,
      };
    });

    const updated = { ...session, items };
    setSession(updated);
    debouncedUpdateSession({ items });
  }

  async function lockAndPay() {
    if (!session || !isOwner) return; // only owner can lock
    const totals = calculateTotals(session, true);
    await updateSession(id, { totals, status: "paying" });
    setSession((s) => s ? { ...s, totals, status: "paying" } : s);
    setTab("pay");
  }

  async function markPaidWithMethod(method: "cash" | "tng" | "other", proof?: string) {
    if (!session) return;
    const currentTotal = totals?.[myName] ?? 0;
    const participants = session.participants.map((p) =>
      p.name === myName
        ? { ...p, hasPaid: true, paymentMethod: method, proofUrl: proof || p.proofUrl, paidAmount: currentTotal }
        : p
    );
    await updateSession(id, { participants });
    setSession((s) => s ? { ...s, participants } : s);
  }

  async function handleSaveQR() {
    if (!session || !session.qrImage) return;
    try {
      if (navigator.share) {
        const res = await fetch(session.qrImage);
        const blob = await res.blob();
        const file = new File([blob], `QR_${session.paidBy}.jpg`, { type: "image/jpeg" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Payment QR",
          });
        } else {
          throw new Error("Cannot share files");
        }
      } else {
        throw new Error("Share API not supported");
      }
    } catch (e) {
      // Fallback for desktop/unsupported browsers
      const a = document.createElement("a");
      a.href = session.qrImage;
      a.download = `QR_${session.paidBy}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function handleTNGPay() {
    window.location.href = "tngdwallet://client/dl/home";
  }

  async function handleDeleteAddedItem(itemId: string) {
    if (!session) return;
    const item = session.items.find(i => i.id === itemId);
    if (!item || !item.addedLater) return;

    if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;

    const newItems = session.items.filter(i => i.id !== itemId);
    await updateSession(id, { items: newItems });
    setSession(s => s ? { ...s, items: newItems } : s);
  }

  function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress and convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setProofImage(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input so user can re-select
    e.target.value = "";
  }

  async function confirmPayment() {
    if (!paymentMethod) return;
    await markPaidWithMethod(paymentMethod, proofImage || undefined);
    setPaymentMethod(null);
    setProofImage(null);
  }

  async function handleRemoveParticipant(nameToRemove: string) {
    if (!session || session.paidBy !== myName) return;
    if (!confirm(`Are you sure you want to remove ${nameToRemove}?`)) return;

    const newParticipants = session.participants.filter(p => p.name !== nameToRemove);
    let newItems = session.items;

    // Unassign them from any claimed items if in byItem mode
    if (session.splitMode === "byItem") {
      newItems = session.items.map(item => {
        if (!item.assignedTo) return item;

        if (Array.isArray(item.assignedTo)) {
          const newAssignedTo = item.assignedTo.filter((name: string) => name !== nameToRemove);
          return { ...item, assignedTo: newAssignedTo };
        } else {
          const newAssignedTo = { ...item.assignedTo };
          delete newAssignedTo[nameToRemove];
          return { ...item, assignedTo: newAssignedTo };
        }
      });
    }

    await updateSession(id, { participants: newParticipants, items: newItems });
    setSession(s => s ? { ...s, participants: newParticipants, items: newItems } : s);
  }

  async function handleShare() {
    if (!session) return;
    const joinUrl = `${window.location.origin}/join/${session.code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join SplitLah",
          text: `Join my bill split room: ${session.code}`,
          url: joinUrl,
        });
        return;
      } catch {
        // User cancelled share
      }
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard failed
    }
  }

  async function handleAddFriend() {
    if (!session || !newFriendName.trim()) return;
    const trimmed = newFriendName.trim();
    // Check for duplicate name
    if (session.participants.some(p => p.name === trimmed)) {
      alert(`"${trimmed}" is already in the room!`);
      return;
    }
    const newParticipants = [...session.participants, { name: trimmed, hasPaid: false }];
    await updateSession(id, { participants: newParticipants });
    setSession(s => s ? { ...s, participants: newParticipants } : s);
    setNewFriendName("");
    setIsAddingFriend(false);
    setSelectForFriend(trimmed);
  }

  async function copyClaimLink(participantName: string) {
    if (!session) return;
    const claimUrl = `${window.location.origin}/join/${session.code}?as=${encodeURIComponent(participantName)}`;
    try {
      await navigator.clipboard.writeText(claimUrl);
      setFriendLinkCopied(participantName);
      setTimeout(() => setFriendLinkCopied(null), 2000);
    } catch {
      // fallback
      prompt("Copy this link:", claimUrl);
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  const totals = calculateTotals(session);

  const myTotal = totals?.[myName] ?? 0;
  const amIPayer = session.paidBy === myName;
  const myParticipant = session.participants.find((p) => p.name === myName);
  const pendingCount = session.participants.filter((p) => {
    if (p.name === session.paidBy) return false;
    const pTotal = totals?.[p.name] ?? 0;
    const hasUnpaidBalance = pTotal > (p.paidAmount ?? 0) + 0.01;
    return !p.hasPaid || hasUnpaidBalance;
  }).length;
  const receiptItemsTotal = session.items.filter(i => !i.addedLater).reduce((s, i) => s + (Number(i.price) || 0), 0);
  const addedItemsTotal = session.items.filter(i => i.addedLater).reduce((s, i) => s + (Number(i.price) || 0), 0);
  const itemsSubtotal = receiptItemsTotal + addedItemsTotal;
  const grandTotal = itemsSubtotal + (session.serviceCharge || 0) + (session.sst || 0) + (session.rounding || 0);
  const isLocked = session.status === "paying" || session.status === "done";

  let unclaimedAmount = 0;
  if (session.splitMode === "byItem") {
    let unclaimedSubtotal = 0;
    const totalSubtotal = session.items.reduce((s, i) => s + (Number(i.price) || 0), 0);

    session.items.forEach(item => {
      const price = Number(item.price) || 0;
      if (price <= 0) return;
      const assignments = getAssignments(item);
      const assignedNames = Object.keys(assignments).filter((n) => assignments[n] > 0);
      if (assignedNames.length === 0) {
        unclaimedSubtotal += price;
      } else {
        const totalClaimed = assignedNames.reduce((sum, n) => sum + assignments[n], 0);
        if (totalClaimed < (item.quantity || 1)) {
          unclaimedSubtotal += (price / (item.quantity || 1)) * ((item.quantity || 1) - totalClaimed);
        }
      }
    });

    if (unclaimedSubtotal > 0 && totalSubtotal > 0) {
      const ratioUnclaimed = unclaimedSubtotal / totalSubtotal;
      unclaimedAmount = unclaimedSubtotal + (session.serviceCharge || 0) * ratioUnclaimed + (session.sst || 0) * ratioUnclaimed + (session.rounding || 0) * ratioUnclaimed;
    }
  }

  function renderItemsList(targetName: string) {
    const s = session!;
    const receiptItems = s.items.filter(i => !i.addedLater);
    const addedItems = s.items.filter(i => i.addedLater);

    function renderItemRow(item: LineItem) {
      const assignments = getAssignments(item);
      const isMine = (assignments[targetName] || 0) > 0;
      const myClaimedQty = assignments[targetName] || 0;
      const assignees = Object.keys(assignments).filter((n) => assignments[n] > 0);
      const totalQty = item.quantity || 1;
      const totalClaimed = assignees.reduce((sum, n) => sum + assignments[n], 0);
      const qtyLeft = Math.max(0, totalQty - totalClaimed);
      const isFullyClaimed = totalClaimed >= totalQty;
      const effectiveParticipant = s.participants.find(p => p.name === targetName);
      // Paid users can still interact with addedLater items, but not original items
      const canInteract = s.status !== "done" && (item.addedLater
        ? (isMine || !isFullyClaimed)
        : (!effectiveParticipant?.hasPaid && (isMine || !isFullyClaimed)));
      const myShare = getItemShare(item, targetName, s.participants.length, isLocked, s.paidBy);

      return (
        <div
          key={item.id}
          onClick={() => {
            if (s.splitMode === "byItem" && canInteract) {
              toggleItemAssignment(item.id, targetName);
            }
          }}
          className={clsx(
            "flex items-center justify-between py-3 transition-all receipt-dashed",
            s.splitMode === "byItem" && canInteract ? "cursor-pointer" : "cursor-not-allowed",
            !canInteract && "opacity-50 grayscale",
            isMine && s.splitMode === "byItem"
              ? "bg-brand/10 border-l-4 border-brand pl-3 pr-4 shadow-inner -mx-4"
              : "px-0"
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-main text-sm truncate font-bold">{item.name}</span>
                {(item.quantity ?? 1) > 1 && (
                  <span className={clsx(
                    "text-xs flex-shrink-0 font-bold",
                    s.splitMode === "byItem" && qtyLeft > 0 ? "text-brand" : "text-subtle"
                  )}>
                    {s.splitMode === "byItem" ? `×${qtyLeft} left` : `×${item.quantity}`}
                  </span>
                )}
              </div>
              {s.splitMode === "byItem" && assignees.length > 0 && (
                <div className="text-subtle text-xs mt-1 truncate">
                  {assignees.map((name) => {
                    const qty = assignments[name];
                    return `${name}${item.quantity > 1 ? ` (${qty})` : ""}`;
                  }).join(", ")}
                </div>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0 ml-2">
            <span className="text-main font-mono text-sm font-bold">
              RM {(Number(item.price) || 0).toFixed(2)}
            </span>
            {s.splitMode === "byItem" && isMine && (
              <p className="text-brand text-xs font-mono font-bold mt-1">
                share: RM {myShare.toFixed(2)}
              </p>
            )}
          </div>

          {/* Delete button for added items */}
          {item.addedLater && isOwner && canInteract && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteAddedItem(item.id);
              }}
              className="ml-2 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Receipt Items */}
        <div>
          <div className="flex justify-between items-end border-b border-divider pb-2 mb-2">
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-subtle uppercase tracking-widest font-bold">
                📋 Receipt Items
              </p>
              {s.splitMode === "byItem" && (
                <p className="text-[10px] text-brand italic">tap to claim yours</p>
              )}
            </div>
            {s.splitMode === "byItem" && (
              <div className="flex gap-1">
                <button onClick={() => deselectAll(targetName)} className="text-subtle hover:text-main font-medium text-[11px] px-2 py-1 rounded-md hover:bg-muted/50 active:scale-95 transition-all">
                  Clear all
                </button>
                <button onClick={() => claimRest(targetName)} className="text-subtle hover:text-main font-medium text-[11px] px-2 py-1 rounded-md hover:bg-muted/50 active:scale-95 transition-all">
                  Claim rest
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {receiptItems.map(renderItemRow)}
          </div>
        </div>

        {/* Added Later Items */}
        {addedItems.length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-subtle uppercase tracking-widest mb-2 font-bold border-b border-divider pb-1">
              ➕ Added Later
              {myParticipant?.hasPaid && (
                <span className="ml-2 text-yellow-600 normal-case italic">unpaid add-ons</span>
              )}
            </p>
            <div className="space-y-2">
              {addedItems.map(renderItemRow)}
            </div>
          </div>
        )}

        {/* Inline Add Missing Item */}
        {s.splitMode === "byItem" && (
          <div>
            {isAddingItem ? (
              <div className="bg-surface rounded-xl p-3 border border-brand/30 space-y-3">
                <p className="text-xs text-brand font-medium">Add missing item</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Item name"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:ring-1 focus:ring-brand placeholder-subtle"
                    autoFocus
                  />
                  <div className="relative w-24">
                    <span className="absolute left-3 top-2 text-subtle text-sm">RM</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.10"
                      min="0"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      className="w-full bg-muted rounded-lg pl-8 pr-3 py-2 text-sm text-main font-mono focus:outline-none focus:ring-1 focus:ring-brand placeholder-subtle"
                    />
                  </div>
                </div>
                {/* Quantity selector */}
                <div className="flex items-center gap-3">
                  <span className="text-subtle text-xs">Qty:</span>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                    <button
                      onClick={() => setNewItemQty(Math.max(1, newItemQty - 1))}
                      className="w-7 h-7 flex items-center justify-center rounded bg-divider text-main hover:bg-divider active:scale-90 transition-all font-bold text-sm"
                    >
                      -
                    </button>
                    <span className="text-main text-sm font-mono px-2 min-w-[20px] text-center">
                      {newItemQty}
                    </span>
                    <button
                      onClick={() => setNewItemQty(newItemQty + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded bg-divider text-main hover:bg-divider active:scale-90 transition-all font-bold text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddMissingItem}
                    disabled={!newItemName.trim() || !newItemPrice || saving}
                    className="flex-1 bg-brand text-white font-semibold text-sm py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-50 transition-all"
                  >
                    Add & Claim
                  </button>
                  <button
                    onClick={() => { setIsAddingItem(false); setNewItemName(""); setNewItemPrice(""); setNewItemQty(1); }}
                    className="px-4 bg-muted text-main font-semibold text-sm py-2 rounded-lg hover:bg-divider transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingItem(true)}
                className="w-full border border-dashed border-divider rounded-xl py-3 text-subtle font-bold text-sm hover:border-brand hover:text-brand transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <span>+</span> Add missing item
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-32 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <div className="flex items-center mb-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-subtle hover:text-main font-medium transition-colors text-sm px-2 py-1.5 -ml-2 mr-2 flex-shrink-0"
          >
            ← Back
          </button>
          <div className="inline-flex items-center gap-2 bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-full text-xs text-brand font-medium">
            Paying as<span className="font-bold">{myName}</span>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2">
            <span className="text-xs bg-muted text-subtle px-3 py-1.5 rounded-full flex items-center">
              {session.participants.length} Participants
            </span>
            {session.status !== "done" && (
              <button
                onClick={() => router.push(`/room/${id}/settings`)}
                className="bg-muted text-main w-8 h-8 rounded-full flex items-center justify-center hover:bg-divider active:scale-95 transition-all"
              >
                ⚙️
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold font-mono">{session.name || session.code}</h1>
        </div>
        <div className="text-subtle text-sm flex items-center justify-between mb-6">
          <span>
            Paid by <span className="text-brand font-medium">{session.paidBy}</span>
            {isOwner && <span className="text-subtle text-xs ml-2">· You're the host</span>}
          </span>
          {isOwner && session.status === "splitting" && (
            <button
              onClick={() => router.push(`/scan?session=${session.id}`)}
              className="bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 active:scale-95 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              Rescan / Edit
            </button>
          )}
        </div>

        {/* Share room link card */}
        <div className="flex gap-2 mb-6">
          <div
            className="flex-1 bg-surface rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
            onClick={handleShare}
          >
            <div>
              <p className="text-subtle text-xs">Share invite link — tap to share</p>
              <p className="text-brand font-mono font-semibold tracking-widest">{session.code}</p>
            </div>
            <span className="text-xl">
              {linkCopied ? "✅" : "🔗"}
            </span>
          </div>
          <button
            onClick={() => setShowShareQR(true)}
            className="bg-surface/80 backdrop-blur-md border border-divider rounded-xl px-4 flex items-center justify-center hover:bg-muted active:scale-[0.98] transition-transform text-subtle hover:text-main"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="5" height="5" x="3" y="3" rx="1" />
              <rect width="5" height="5" x="16" y="3" rx="1" />
              <rect width="5" height="5" x="3" y="16" rx="1" />
              <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
              <path d="M21 21v.01" />
              <path d="M12 7v3a2 2 0 0 1-2 2H7" />
              <path d="M3 12h.01" />
              <path d="M12 3h.01" />
              <path d="M12 16v.01" />
              <path d="M16 12h1" />
              <path d="M21 12v.01" />
              <path d="M12 21v-1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mx-4 mb-6 bg-surface rounded-xl p-1">
        {(["split", "pay"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all",
              tab === t ? "bg-brand text-white" : "text-subtle hover:text-main"
            )}
          >
            {t === "split" ? "Split" : "Pay"}
          </button>
        ))}
      </div>

      {/* ── SPLIT TAB ── */}
      {tab === "split" && (
        <div className="px-4 space-y-6">
          {/* Dropdown Backdrop */}
          {activeParticipantMenu && (
            <div className="fixed inset-0 z-40" onClick={() => setActiveParticipantMenu(null)} />
          )}

          {/* Splitting Method Row */}
          <div className="bg-surface/80 backdrop-blur-md border border-divider/50 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xl">
                {session.splitMode === "even" ? "⚖️" : "🎯"}
              </div>
              <div>
                <p className="text-subtle text-[10px] uppercase tracking-widest font-bold mb-0.5">Splitting Method</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-main font-mono text-lg font-bold">
                    {session.splitMode === "even" ? "Split Equally" : "Choose Items"}
                  </p>
                  {session.splitMode === "even" && session.participants.length > 0 && (
                    <span className="text-brand font-mono text-sm font-bold">
                      · RM {(grandTotal / session.participants.length).toFixed(2)}/pax
                    </span>
                  )}
                </div>
              </div>
            </div>
            {isOwner && session.status !== "done" && (
              <button onClick={() => router.push(`/room/${id}/settings`)} className="bg-muted text-main px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-divider active:scale-95 transition-all">
                Change
              </button>
            )}
          </div>

          {/* Participants */}
          <div>
            <p className="text-xs text-subtle uppercase tracking-wide mb-2">Participants</p>
            <div className="flex flex-wrap gap-2">
              {session.participants.map((p) => (
                <div key={p.name} className="relative">
                  <button
                    onClick={() => {
                      if (isOwner && session.status !== "done" && p.name !== myName) {
                        setActiveParticipantMenu(activeParticipantMenu === p.name ? null : p.name);
                      }
                    }}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl text-sm font-medium flex items-center gap-1 transition-all",
                      p.name === session.paidBy
                        ? "bg-brand/20 text-brand border border-brand/30"
                        : p.name === myName
                          ? "bg-muted text-main border border-divider"
                          : "bg-muted text-main",
                      isOwner && session.status !== "done" && p.name !== myName ? "hover:ring-2 hover:ring-brand/50 cursor-pointer" : "cursor-default"
                    )}
                  >
                    <AnimalAvatar name={p.name} customIcon={p.icon} className="mr-1.5 w-6 h-6" />{p.name}
                    {p.name === session.paidBy && <span className="ml-1 text-xs">💳</span>}
                    {p.name === myName && p.name !== session.paidBy && <span className="ml-1 text-xs">(you)</span>}
                    {isOwner && session.status !== "done" && p.name !== myName && (
                      <span className="ml-1 text-subtle text-[10px]">▼</span>
                    )}
                  </button>

                  {/* Dropdown Menu */}
                  {activeParticipantMenu === p.name && (
                    <div className="absolute top-full mt-2 left-0 bg-surface/80 backdrop-blur-md border border-divider/50 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.5)] p-1 z-50 flex flex-col min-w-[160px] animate-in slide-in-from-top-2 duration-200">
                      <button
                        onClick={() => {
                          copyClaimLink(p.name);
                          setActiveParticipantMenu(null);
                        }}
                        className="text-left px-3 py-2 text-sm text-main hover:text-main hover:bg-muted rounded-lg flex items-center gap-2 transition-colors"
                      >
                        <span className="text-lg">{friendLinkCopied === p.name ? "✅" : "🔗"}</span>
                        Share claim link
                      </button>
                      {session.splitMode === "byItem" && (
                        <button
                          onClick={() => {
                            setSelectForFriend(p.name);
                            setActiveParticipantMenu(null);
                          }}
                          className="text-left px-3 py-2 text-sm text-main hover:text-main hover:bg-muted rounded-lg flex items-center gap-2 transition-colors"
                        >
                          <span className="text-lg">🎯</span>
                          Help pick items
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add Friend button (owner only) */}
              {isOwner && session.status !== "done" && !isAddingFriend && (
                <button
                  onClick={() => {
                    setNewFriendName("");
                    setIsAddingFriend(true);
                  }}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium border border-dashed border-divider text-subtle hover:border-brand hover:text-brand transition-colors"
                >
                  + Add friend
                </button>
              )}
            </div>

            {/* Add Friend inline form */}
            {isOwner && isAddingFriend && (
              <div className="mt-3 bg-surface rounded-xl p-3 border border-divider/50 space-y-2">
                <p className="text-subtle text-xs">Create a participant on their behalf:</p>
                <input
                  type="text"
                  placeholder="Friend's name"
                  value={newFriendName}
                  onChange={(e) => setNewFriendName(e.target.value)}
                  className="w-full bg-muted border border-divider/50 rounded-lg px-3 py-2 text-main text-sm placeholder-subtle focus:outline-none focus:border-brand transition-colors"
                  maxLength={24}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddFriend(); }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddFriend}
                    disabled={!newFriendName.trim()}
                    className="flex-1 bg-brand text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition-all"
                  >
                    Add & Select Items for Them
                  </button>
                  <button
                    onClick={() => { setIsAddingFriend(false); setNewFriendName(""); }}
                    className="px-3 bg-muted text-main text-sm py-2 rounded-lg hover:bg-divider transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>



          {/* Receipt Header & Action */}
          {session.receiptImage && (
            <div className="flex justify-end mt-4 mb-2">
              <button
                onClick={() => setViewingReceipt(session.receiptImage!)}
                className="text-xs text-brand underline decoration-brand/50 hover:decoration-brand underline-offset-4 flex items-center gap-1.5 transition-colors"
              >
                <span>🧾</span> View Scanned Receipt
              </button>
            </div>
          )}

          {/* Items Container with Receipt Theme */}
          <div className="receipt-bg receipt-edge-top receipt-edge-bottom px-5 pb-5 pt-3 -mx-2 shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative z-10 font-mono">
            {renderItemsList(myName)}
          </div>

          {/* Summary */}
          <div className="bg-surface rounded-2xl p-4 space-y-2">
            <div className="bg-brand/10 border border-brand/20 rounded-xl p-3 text-center mb-4">
              <p className="text-brand text-xs uppercase tracking-widest font-bold">Your Total</p>
              <p className="text-brand font-bold text-2xl font-mono">RM {myTotal.toFixed(2)}</p>
            </div>
            <p className="text-xs text-subtle uppercase tracking-wide mb-3">Summary</p>
            {session.participants.map((p) => {
              const baseTotal = totals?.[p.name] ?? 0;
              const displayTotal = p.name === session.paidBy ? Math.max(0, baseTotal - unclaimedAmount) : baseTotal;

              return (
                <div key={p.name} className="flex justify-between items-center">
                  <span className={clsx("flex items-center text-sm", p.name === myName && "text-brand font-medium")}>
                    <AnimalAvatar name={p.name} customIcon={p.icon} className="mr-1.5 w-6 h-6" />{p.name === myName ? `${p.name} (you)` : p.name}
                  </span>
                  <span className="font-mono text-sm text-main">
                    RM {displayTotal.toFixed(2)}
                  </span>
                </div>
              );
            })}
            {unclaimedAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm italic text-subtle">
                  <span className="mr-1.5 text-lg"></span>Unclaimed items
                </span>
                <span className="font-mono text-sm text-subtle">
                  RM {unclaimedAmount.toFixed(2)}
                </span>
              </div>
            )}
            {(session.serviceCharge > 0 || session.sst > 0 || addedItemsTotal > 0) && (
              <div className="border-t border-divider pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-subtle text-xs">
                  <span>Receipt Items</span>
                  <span className="font-mono">RM {receiptItemsTotal.toFixed(2)}</span>
                </div>
                {addedItemsTotal > 0 && (
                  <div className="flex justify-between text-brand text-xs">
                    <span>+ Missing Items</span>
                    <span className="font-mono">RM {addedItemsTotal.toFixed(2)}</span>
                  </div>
                )}
                {(addedItemsTotal > 0 || session.serviceCharge > 0 || session.sst > 0 || session.rounding !== 0) && (
                  <div className="flex justify-between text-subtle text-xs pt-1 border-t border-divider/30 mt-1">
                    <span>Subtotal</span>
                    <span className="font-mono">RM {itemsSubtotal.toFixed(2)}</span>
                  </div>
                )}
                {session.serviceCharge > 0 && (
                  <div className="flex justify-between text-subtle text-xs">
                    <span>Service Charge</span>
                    <span className="font-mono">RM {session.serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                {session.sst > 0 && (
                  <div className="flex justify-between text-subtle text-xs">
                    <span>SST</span>
                    <span className="font-mono">RM {session.sst.toFixed(2)}</span>
                  </div>
                )}
                {session.rounding !== undefined && session.rounding !== 0 && (
                  <div className="flex justify-between text-subtle text-xs">
                    <span>Rounding</span>
                    <span className="font-mono">{session.rounding < 0 ? "-RM " + Math.abs(session.rounding).toFixed(2) : "RM " + session.rounding.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-divider pt-2 mt-2 flex justify-between">
              <span className="text-subtle text-sm font-semibold">Total</span>
              <span className="font-mono font-bold text-brand">
                RM {grandTotal.toFixed(2)}
              </span>
            </div>
            {session.receiptTotal > 0 && Math.abs(grandTotal - session.receiptTotal) >= 0.05 && (
              <div className="flex justify-between items-center">
                <span className="text-yellow-400 text-xs">⚠ Receipt says</span>
                <span className="font-mono text-xs text-yellow-400">
                  RM {session.receiptTotal.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAY TAB ── */}
      {tab === "pay" && (
        <div className="px-4 space-y-4">
          {amIPayer ? (
            // Payer view — see who's paid
            <div className="space-y-4">
              {(() => {
                const myShare = totals?.[myName] ?? 0;
                let collected = 0;
                let expectedToCollect = 0;

                session.participants.forEach(p => {
                  if (p.name === myName) return;
                  const pTotal = totals?.[p.name] ?? 0;
                  expectedToCollect += pTotal;
                  if (p.hasPaid) {
                    collected += p.paidAmount ?? pTotal;
                  }
                });

                const hostActualShare = Math.max(0, myShare - unclaimedAmount);

                const remaining = Math.max(0, expectedToCollect - collected);

                const actualSharePct = grandTotal > 0 ? (hostActualShare / grandTotal) * 100 : 0;
                const unclaimedPct = grandTotal > 0 ? (unclaimedAmount / grandTotal) * 100 : 0;
                const collectedPct = grandTotal > 0 ? (collected / grandTotal) * 100 : 0;

                const gradientString = `conic-gradient(
                  #015ABF 0% ${actualSharePct}%, 
                  #52525b ${actualSharePct}% ${actualSharePct + unclaimedPct}%, 
                  #00C16E ${actualSharePct + unclaimedPct}% ${actualSharePct + unclaimedPct + collectedPct}%, 
                  #fbbf24 ${actualSharePct + unclaimedPct + collectedPct}% 100%
                )`;

                return (
                  <div className="bg-surface/80 backdrop-blur-md border border-divider/50 rounded-2xl p-5 mb-4 shadow-lg">
                    <p className="text-xs text-subtle uppercase tracking-wide mb-5 font-semibold">Your Collection Summary</p>

                    <div className="flex items-center gap-6">
                      {/* Donut Chart */}
                      <div className="relative w-28 h-28 flex-shrink-0 rounded-full flex items-center justify-center" style={{ background: gradientString }}>
                        {/* Inner Hole for Donut */}
                        <div className="absolute inset-0 m-auto w-20 h-20 bg-surface rounded-full flex flex-col items-center justify-center shadow-inner">
                          <span className="text-[9px] text-subtle uppercase font-semibold">Total</span>
                          <span className="text-sm font-mono font-bold text-main">RM {Math.round(grandTotal)}</span>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#015ABF]" />
                            <span className="text-subtle text-xs">Your Share</span>
                          </div>
                          <span className="text-main font-mono text-sm font-medium">RM {hostActualShare.toFixed(2)}</span>
                        </div>
                        {unclaimedAmount > 0 && (
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-divider" />
                              <span className="text-subtle text-xs italic">Unclaimed</span>
                            </div>
                            <span className="text-subtle font-mono text-sm font-medium">RM {unclaimedAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#00C16E]" />
                            <span className="text-subtle text-xs">Collected</span>
                          </div>
                          <span className="text-main font-mono text-sm font-medium">RM {collected.toFixed(2)}</span>
                        </div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                            <span className="text-subtle text-xs">Remaining</span>
                          </div>
                          <span className="text-yellow-400 font-mono text-sm font-medium">RM {remaining.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="bg-surface rounded-2xl p-4">
                <p className="text-subtle text-xs uppercase tracking-wide mb-3">Participant Status</p>
                <div className="space-y-3">
                  {session.participants
                    .filter((p) => p.name !== session.paidBy)
                    .map((p) => {
                      return (
                        <div key={p.name} className="bg-muted/50 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const pTotal = totals?.[p.name] ?? 0;
                                const hasUnpaidBalance = p.hasPaid && (pTotal > (p.paidAmount ?? 0) + 0.01);
                                const isFullyPaid = p.hasPaid && !hasUnpaidBalance;

                                return (
                                  <>
                                    <div
                                      className={clsx(
                                        "w-3 h-3 rounded-full",
                                        isFullyPaid ? "bg-brand" : hasUnpaidBalance ? "bg-yellow-400" : "bg-divider"
                                      )}
                                    />
                                    <span className="text-sm text-main font-medium flex items-center">
                                      <AnimalAvatar name={p.name} customIcon={p.icon} className="mr-1.5 w-6 h-6" />{p.name}
                                    </span>
                                    {isFullyPaid && (
                                      <span className="text-brand text-xs flex items-center gap-1">
                                        ✓ {p.paymentMethod === "cash" ? "Cash" : p.paymentMethod === "tng" ? "TNG" : p.paymentMethod === "other" ? "Other" : "paid"}
                                      </span>
                                    )}
                                    {hasUnpaidBalance && (
                                      <span className="text-yellow-400 text-xs flex items-center gap-1">
                                        ⚡ Unpaid Add-ons
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-2">
                              {p.hasPaid && p.proofUrl && (
                                <button
                                  onClick={() => setViewingProof(p.proofUrl!)}
                                  className="text-[10px] bg-brand/20 text-brand px-2 py-0.5 rounded-full hover:bg-brand/30 transition-colors"
                                >
                                  📎 Proof
                                </button>
                              )}
                              <span className="font-mono text-sm text-main font-semibold">
                                RM {(totals?.[p.name] ?? 0).toFixed(2)}
                              </span>
                              {session.status !== "done" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveParticipant(p.name);
                                  }}
                                  className="ml-1 w-5 h-5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-main flex items-center justify-center transition-colors"
                                  title="Remove participant"
                                >
                                  <span className="text-[12px] leading-none mb-0.5">✕</span>
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Item breakdown */}
                          <div className="border-t border-divider/50 px-4 py-2 space-y-1">
                            {(() => {
                              const personSubtotal = session.items.reduce((sum, item) => {
                                const share = session.splitMode === "byItem"
                                  ? getItemShare(item, p.name, session.participants.length, isLocked, session.paidBy)
                                  : (Number(item.price) || 0) / session.participants.length;
                                return sum + share;
                              }, 0);

                              const totalSubtotal = session.items.reduce((sum, item) => {
                                return sum + (Number(item.price) || 0);
                              }, 0);

                              const ratio = totalSubtotal > 0 ? personSubtotal / totalSubtotal : 1 / session.participants.length;
                              const personServiceCharge = (session.serviceCharge || 0) * ratio;
                              const personSst = (session.sst || 0) * ratio;

                              // Group items into claimed and unclaimed (if splitMode is byItem)
                              const claimedItems: { name: string; share: number; qtyClaimed: number; totalQty: number }[] = [];
                              let unclaimedShareSum = 0;

                              session.items.forEach((item) => {
                                const price = Number(item.price) || 0;
                                if (price <= 0) return;

                                if (session.splitMode === "byItem") {
                                  const assignments = getAssignments(item);
                                  const assignees = Object.keys(assignments).filter((n) => assignments[n] > 0);
                                  const isClaimedByMe = assignments[p.name] > 0;

                                  if (isClaimedByMe) {
                                    const share = getItemShare(item, p.name, session.participants.length, isLocked, session.paidBy);
                                    claimedItems.push({
                                      name: item.name,
                                      share,
                                      qtyClaimed: assignments[p.name],
                                      totalQty: item.quantity
                                    });
                                  } else if (assignees.length === 0) {
                                    const share = getItemShare(item, p.name, session.participants.length, isLocked, session.paidBy);
                                    unclaimedShareSum += share;
                                  }
                                } else {
                                  // Even split: show all items since everyone pays an equal share
                                  const share = price / session.participants.length;
                                  claimedItems.push({
                                    name: item.name,
                                    share,
                                    qtyClaimed: 0,
                                    totalQty: item.quantity
                                  });
                                }
                              });

                              return (
                                <>
                                  {claimedItems.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-xs"
                                    >
                                      <span className="text-subtle truncate mr-2">
                                        {item.name}
                                        {session.splitMode === "byItem" && item.totalQty > 1 && item.qtyClaimed > 0 && (
                                          <span className="text-subtle ml-1">({item.qtyClaimed} of {item.totalQty})</span>
                                        )}
                                      </span>
                                      <span className="text-main font-mono flex-shrink-0">
                                        RM {item.share.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}

                                  {/* Shared / Unclaimed items sum */}
                                  {session.splitMode === "byItem" && unclaimedShareSum > 0 && (
                                    <div className="flex items-center justify-between text-xs text-subtle italic">
                                      <span>Unclaimed Items (on host)</span>
                                      <span className="font-mono flex-shrink-0">
                                        RM {unclaimedShareSum.toFixed(2)}
                                      </span>
                                    </div>
                                  )}

                        {/* Service charge and SST proportional breakdown */}
                                  {(session.serviceCharge > 0 || session.sst > 0 || session.rounding !== 0) && (
                                    <div className="mt-1 pt-1 border-t border-divider/30 flex flex-col gap-0.5 text-[10px] text-subtle">
                                      {session.serviceCharge > 0 && (
                                        <div className="flex justify-between">
                                          <span>Service Charge</span>
                                          <span className="font-mono">RM {personServiceCharge.toFixed(2)}</span>
                                        </div>
                                      )}
                                      {session.sst > 0 && (
                                        <div className="flex justify-between">
                                          <span>SST</span>
                                          <span className="font-mono">RM {personSst.toFixed(2)}</span>
                                        </div>
                                      )}
                                      {session.rounding !== undefined && session.rounding !== 0 && (
                                        <div className="flex justify-between">
                                          <span>Rounding</span>
                                          <span className="font-mono">
                                            {session.rounding < 0 
                                              ? "-RM " + Math.abs((session.rounding || 0) * ratio).toFixed(2) 
                                              : "RM " + ((session.rounding || 0) * ratio).toFixed(2)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              {pendingCount > 0 && (
                <p className="text-subtle text-xs text-center">
                  {pendingCount} person{pendingCount > 1 ? "s" : ""} still pending
                </p>
              )}
              {pendingCount === 0 && session.participants.filter(p => p.name !== session.paidBy).length > 0 && (
                <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center">
                  <p className="text-brand font-semibold">🎉 Everyone has paid!</p>
                </div>
              )}
              {pendingCount === 0 && session.participants.filter(p => p.name !== session.paidBy).length === 0 && (
                <div className="bg-surface rounded-2xl p-4 text-center">
                  <p className="text-subtle text-sm">No one else in the room yet. Share the room link to invite others!</p>
                </div>
              )}

              {session.status !== "done" ? (
                <div className="mt-8">
                  <button
                    onClick={async () => {
                      if (!confirm("Are you sure you want to settle this receipt? It cannot be changed after settling.")) return;
                      await updateSession(id, { status: "done" });
                      setSession(s => s ? { ...s, status: "done" } : s);
                    }}
                    className="w-full bg-[#015ABF] text-main font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all shadow-xl"
                  >
                    Settle Receipt
                  </button>
                  <p className="text-subtle text-xs text-center mt-3">
                    Settling will lock the receipt permanently and mark it as settled in history.
                  </p>
                </div>
              ) : (
                <div className="bg-[#015ABF]/10 border border-[#015ABF]/30 rounded-2xl p-4 text-center mt-6">
                  <p className="text-[#015ABF] font-bold text-lg">Receipt Settled 🏁</p>
                  <p className="text-[#015ABF]/80 text-sm mt-1">This receipt is finalized and cannot be modified.</p>
                </div>
              )}
            </div>
          ) : (() => {
            // Non-payer view — compute receipt vs add-on breakdown
            const s = session!;
            const receiptItems = s.items.filter(i => !i.addedLater);
            const addedItems = s.items.filter(i => i.addedLater);

            // Calculate subtotals for receipt items vs add-on items
            const receiptSubtotal = receiptItems.reduce((sum, item) => {
              return sum + (s.splitMode === "byItem"
                ? getItemShare(item, myName, s.participants.length, isLocked, s.paidBy)
                : (Number(item.price) || 0) / s.participants.length);
            }, 0);

            const addOnSubtotal = addedItems.reduce((sum, item) => {
              return sum + (s.splitMode === "byItem"
                ? getItemShare(item, myName, s.participants.length, isLocked, s.paidBy)
                : (Number(item.price) || 0) / s.participants.length);
            }, 0);

            const hasUnpaidAddOns = myParticipant?.hasPaid && (myTotal > (myParticipant.paidAmount ?? 0) + 0.01);
            const amountToPay = hasUnpaidAddOns ? myTotal - (myParticipant.paidAmount ?? 0) : myTotal;

            // Helper to render item breakdown list
            function renderItemList(items: LineItem[]) {
              const claimedItems: { name: string; share: number; qtyClaimed: number; totalQty: number }[] = [];
              let unclaimedShareSum = 0;

              items.forEach((item) => {
                const price = Number(item.price) || 0;
                if (price <= 0) return;

                if (s.splitMode === "byItem") {
                  const assignments = getAssignments(item);
                  const assignees = Object.keys(assignments).filter((n) => assignments[n] > 0);
                  const isClaimedByMe = assignments[myName] > 0;

                  if (isClaimedByMe) {
                    const share = getItemShare(item, myName, s.participants.length, isLocked, s.paidBy);
                    claimedItems.push({ name: item.name, share, qtyClaimed: assignments[myName], totalQty: item.quantity });
                  } else if (assignees.length === 0) {
                    const share = getItemShare(item, myName, s.participants.length, isLocked, s.paidBy);
                    unclaimedShareSum += share;
                  }
                } else {
                  const share = price / s.participants.length;
                  claimedItems.push({ name: item.name, share, qtyClaimed: 0, totalQty: item.quantity });
                }
              });

              return (
                <>
                  {claimedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-main text-sm truncate mr-2">
                        {item.name}
                        {s.splitMode === "byItem" && item.totalQty > 1 && item.qtyClaimed > 0 && (
                          <span className="text-subtle text-xs ml-1">({item.qtyClaimed} of {item.totalQty})</span>
                        )}
                      </span>
                      <span className="text-main font-mono text-sm flex-shrink-0">
                        RM {item.share.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {s.splitMode === "byItem" && unclaimedShareSum > 0 && (
                    <div className="flex items-center justify-between text-subtle text-sm italic">
                      <span>Unclaimed Items (on host)</span>
                      <span className="font-mono text-main text-sm flex-shrink-0">
                        RM {unclaimedShareSum.toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              );
            }

            return (
              <div className="space-y-4">
                {/* Top amount display */}
                <div className="bg-surface rounded-2xl p-6 text-center">
                  <p className="text-subtle text-sm mb-1">
                    {hasUnpaidAddOns ? "Add-on balance" : "You owe"}
                  </p>
                  <p className="text-4xl font-bold font-mono text-main mb-1">
                    RM {amountToPay.toFixed(2)}
                  </p>
                  <p className="text-subtle text-sm">to {s.paidBy}</p>
                </div>

                {/* Box 1: Paid items (shown when user has paid) */}
                {myParticipant?.hasPaid && (
                  <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-brand text-xs font-semibold uppercase tracking-wide">✅ Paid</span>
                      {myParticipant.paymentMethod && (
                        <span className="text-subtle text-xs">
                          via {myParticipant.paymentMethod === "cash" ? "💵 Cash" : myParticipant.paymentMethod === "tng" ? "💚 TNG" : "💳 Other"}
                        </span>
                      )}
                      <span className="ml-auto text-brand font-mono text-sm font-bold">
                        RM {receiptSubtotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-1 opacity-70">
                      {renderItemList(receiptItems)}
                    </div>
                  </div>
                )}

                {/* Box 2: Unpaid add-ons (or full item list if not paid yet) */}
                {hasUnpaidAddOns ? (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-yellow-400 text-xs font-semibold uppercase tracking-wide">⚡ Add-ons (unpaid)</span>
                      <span className="ml-auto text-yellow-400 font-mono text-sm font-bold">
                        RM {addOnSubtotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {renderItemList(addedItems)}
                    </div>
                  </div>
                ) : !myParticipant?.hasPaid && (
                  <div className="bg-surface rounded-2xl p-4">
                    <p className="text-xs text-subtle uppercase tracking-wide mb-2">Your items</p>
                    <div className="space-y-1.5">
                      {renderItemList(s.items)}
                      {/* Tax / Service / Rounding */}
                      {(() => {
                        const mySubtotal = s.items.reduce((sum, item) => {
                          return sum + (s.splitMode === "byItem"
                            ? getItemShare(item, myName, s.participants.length, isLocked, s.paidBy)
                            : (Number(item.price) || 0) / s.participants.length);
                        }, 0);
                        const itemsSubtotal = s.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
                        const ratio = itemsSubtotal > 0 ? (s.splitMode === "even" ? myTotal / (itemsSubtotal / s.participants.length) : myTotal / itemsSubtotal) : 0;
                        const myServiceCharge = (s.serviceCharge || 0) * ratio;
                        const mySst = (s.sst || 0) * ratio;
                        const myRounding = (s.rounding || 0) * ratio;
                        return (s.serviceCharge > 0 || s.sst > 0 || s.rounding !== 0) ? (
                          <div className="pt-2 mt-2 border-t border-divider/30 space-y-1">
                            <div className="flex justify-between text-xs text-subtle">
                              <span>Subtotal</span>
                              <span className="font-mono">RM {mySubtotal.toFixed(2)}</span>
                            </div>
                            {s.serviceCharge > 0 && (
                              <div className="flex justify-between text-subtle text-xs">
                                <span>Service Charge</span>
                                <span className="font-mono">RM {myServiceCharge.toFixed(2)}</span>
                              </div>
                            )}
                            {s.sst > 0 && (
                              <div className="flex justify-between text-subtle text-xs">
                                <span>SST</span>
                                <span className="font-mono">RM {mySst.toFixed(2)}</span>
                              </div>
                            )}
                            {s.rounding !== undefined && s.rounding !== 0 && (
                              <div className="flex justify-between text-subtle text-xs">
                                <span>Rounding</span>
                                <span className="font-mono">
                                  {myRounding < 0 ? "-RM " + Math.abs(myRounding).toFixed(2) : "RM " + myRounding.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : null;
                      })()}
                      <div className="border-t border-divider pt-1.5 mt-1.5 flex justify-between">
                        <span className="text-subtle text-sm font-medium">Total</span>
                        <span className="text-main font-mono text-sm font-semibold">
                          RM {myTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hidden file input for proof upload */}
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleProofUpload}
                  className="hidden"
                />

                {/* Payment flow */}
                {myParticipant?.hasPaid && !hasUnpaidAddOns ? (
                  <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center space-y-2">
                    <p className="text-brand font-semibold">✓ You're all paid up!</p>
                    {myParticipant.paymentMethod && (
                      <p className="text-subtle text-xs">
                        via {myParticipant.paymentMethod === "cash" ? "💵 Cash" : myParticipant.paymentMethod === "tng" ? "💚 Touch 'n Go" : "💳 Other"}
                      </p>
                    )}
                  </div>
                ) : !paymentMethod ? (
                  /* Step 1: Choose payment method */
                  <div className="space-y-3">
                    <p className="text-xs text-subtle uppercase tracking-wide">
                      {hasUnpaidAddOns ? "Pay add-on balance" : "How are you paying?"}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setPaymentMethod("tng")}
                        className="bg-[#015ABF] hover:bg-[#0147a0] text-main font-semibold rounded-2xl py-4 text-sm flex flex-col items-center gap-2 active:scale-95 transition-all"
                      >
                        <span className="text-2xl">💚</span>
                        TNG
                      </button>
                      <button
                        onClick={() => setPaymentMethod("cash")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-main font-semibold rounded-2xl py-4 text-sm flex flex-col items-center gap-2 active:scale-95 transition-all"
                      >
                        <span className="text-2xl">💵</span>
                        Cash
                      </button>
                      <button
                        onClick={() => setPaymentMethod("other")}
                        className="bg-muted hover:bg-divider text-main font-semibold rounded-2xl py-4 text-sm flex flex-col items-center gap-2 active:scale-95 transition-all"
                      >
                        <span className="text-2xl">💳</span>
                        Other
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Step 2: Payment confirmation with proof */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-subtle uppercase tracking-wide">
                        Paying via {paymentMethod === "tng" ? "💚 Touch 'n Go" : paymentMethod === "cash" ? "💵 Cash" : "💳 Other"}
                      </p>
                      <button
                        onClick={() => { setPaymentMethod(null); setProofImage(null); }}
                        className="text-subtle text-xs hover:text-main transition-colors"
                      >
                        ← Change
                      </button>
                    </div>

                    {/* TNG: Open TNG app button */}
                    {paymentMethod === "tng" && (
                      <div className="space-y-3">
                        <div className="bg-brand/10 border border-brand/20 p-3 rounded-xl mb-4">
                          <p className="text-brand font-bold text-sm mb-1">TNG Payment Guidelines</p>
                          <p className="text-brand text-xs">There are 2 ways to pay via TNG:</p>
                          <ul className="text-brand text-xs list-disc pl-4 mt-1">
                            <li>Save the host's payment QR below and scan it in the TNG app.</li>
                            <li>Copy the host's phone number and transfer directly in the app.</li>
                          </ul>
                        </div>

                        {session.qrImage && (
                          <div className="bg-surface/80 backdrop-blur-md border border-divider rounded-2xl p-4 flex flex-col items-center text-center">
                            <img src={session.qrImage} alt="Payment QR" className="w-48 h-48 rounded-xl object-contain mb-3" />
                            <p className="text-subtle text-sm mb-4">Host's Payment QR</p>
                            <button
                              onClick={handleSaveQR}
                              className="w-full bg-muted text-main border border-divider font-bold rounded-xl py-3 text-sm flex items-center justify-center gap-2 hover:bg-divider active:scale-95 transition-all"
                            >
                              <span className="text-lg">📥</span>
                              1. Save QR to Photos
                            </button>
                          </div>
                        )}

                        <button
                          onClick={handleTNGPay}
                          className="w-full bg-[#015ABF] text-main font-bold rounded-2xl py-4 text-base flex flex-col items-center justify-center gap-1 hover:bg-[#0147a0] active:scale-95 transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xl">💚</span>
                            {session.qrImage ? "2. Open TNG App" : "Open TNG App"}
                          </div>
                          <span className="text-sm font-normal opacity-90">Transfer RM {amountToPay.toFixed(2)}</span>
                        </button>

                        {session.paidByPhone && (
                          <button
                            onClick={(e) => {
                              navigator.clipboard.writeText(session.paidByPhone);
                              const btn = e.currentTarget;
                              const original = btn.innerText;
                              btn.innerText = "Copied!";
                              setTimeout(() => (btn.innerText = original), 2000);
                            }}
                            className="w-full bg-surface/80 backdrop-blur-md border border-divider hover:bg-muted text-main font-medium rounded-xl py-3 text-sm active:scale-95 transition-all"
                          >
                            📋 Copy Phone Number ({session.paidByPhone})
                          </button>
                        )}
                      </div>
                    )}

                    {/* Proof upload */}
                    <div className="bg-surface rounded-2xl p-4 space-y-3">
                      <p className="text-subtle text-sm">
                        {paymentMethod === "cash"
                          ? "Paid cash? Snap a photo as proof (optional)."
                          : "Attach a screenshot of your payment as proof (optional)."}
                      </p>

                      {proofImage ? (
                        <div className="relative">
                          <img
                            src={proofImage}
                            alt="Payment proof"
                            className="w-full max-h-48 object-contain rounded-xl border border-divider"
                          />
                          <button
                            onClick={() => setProofImage(null)}
                            className="absolute top-2 right-2 bg-black/70 text-main w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-black/90 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => proofInputRef.current?.click()}
                          className="w-full bg-muted hover:bg-divider text-main font-medium rounded-xl py-3 text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-dashed border-divider"
                        >
                          📷 Attach proof photo
                        </button>
                      )}
                    </div>

                    {/* Confirm payment */}
                    <button
                      onClick={confirmPayment}
                      className="w-full bg-brand text-white font-bold rounded-2xl py-5 text-lg flex items-center justify-center gap-2 hover:bg-opacity-90 active:scale-95 transition-all"
                    >
                      ✓ Confirm Payment · RM {amountToPay.toFixed(2)}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Floating CTA — Split tab only */}
      {tab === "split" && (
        <div className="sticky bottom-6 mt-8 flex justify-center z-20 pointer-events-none">
          <button
            onClick={() => {
              if (grandTotal <= 0) {
                alert("Total cannot be 0. Please add items with prices.");
                return;
              }
              setTab("pay");
            }}
            className="pointer-events-auto w-full max-w-xs bg-brand text-main font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)] border border-brand/20"
          >
            Go to Payment →
          </button>
        </div>
      )}
      {/* Proof image viewer modal */}
      {viewingProof && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setViewingProof(null)}
        >
          <div
            className="relative max-w-lg w-full bg-surface rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
              <p className="text-main font-semibold text-sm">Payment Proof</p>
              <button
                onClick={() => setViewingProof(null)}
                className="text-subtle hover:text-main w-8 h-8 flex items-center justify-center rounded-full hover:bg-divider transition-all"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-surface flex justify-center max-h-[80vh] overflow-y-auto">
              <img
                src={viewingProof}
                alt="Payment proof"
                className="max-w-full h-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Scanned Receipt Modal */}
      {viewingReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setViewingReceipt(null)}
        >
          <div
            className="relative max-w-lg w-full bg-surface rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
              <h3 className="font-bold text-main text-sm">Scanned Receipt</h3>
              <button
                onClick={() => setViewingReceipt(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-subtle hover:text-main hover:bg-divider transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-surface flex justify-center max-h-[80vh] overflow-y-auto">
              <img src={viewingReceipt} alt="Scanned Receipt" className="max-w-full h-auto rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* Select for Friend Modal */}
      {selectForFriend && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in slide-in-from-bottom-full duration-300">
          <div className="p-4 bg-surface/80 backdrop-blur-md border-b border-divider flex items-center justify-between pt-8 pb-4">
            <div>
              <p className="text-subtle text-xs uppercase tracking-widest">Selecting items for</p>
              <p className="text-main font-bold text-lg flex items-center gap-2"><AnimalAvatar name={selectForFriend} customIcon={session.participants.find(p => p.name === selectForFriend)?.icon} className="w-8 h-8" /> {selectForFriend}</p>
            </div>
            <button onClick={() => setSelectForFriend(null)} className="text-brand font-bold px-4 py-2 bg-brand/10 border border-brand/30 rounded-xl hover:bg-brand/20 transition-all">Done</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-32">
            <div className="receipt-bg receipt-edge-top receipt-edge-bottom px-5 pb-5 pt-3 shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative font-mono max-w-lg mx-auto">
              {renderItemsList(selectForFriend)}
            </div>
          </div>
        </div>
      )}



      {/* Share QR Modal */}
      {showShareQR && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowShareQR(false)}>
          <div className="bg-surface/80 backdrop-blur-md border border-divider rounded-2xl w-full max-w-sm p-6 space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="text-main font-bold text-lg">Scan to Join Room</h2>
              <button onClick={() => setShowShareQR(false)} className="text-subtle hover:text-main">✕</button>
            </div>
            <div className="flex justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG value={`${window.location.origin}/join/${session.code}`} size={200} bgColor="#ffffff" fgColor="#000000" />
            </div>
            <p className="text-center text-subtle text-sm">Have your friends scan this QR code to join the room directly.</p>
          </div>
        </div>
      )}
    </main>
  );
}
