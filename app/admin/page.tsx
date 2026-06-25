"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, MessageSquare, Bell, Shield, ShieldAlert, CheckCircle2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'users' | 'notifications'>('feedbacks');
  
  // Data states
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  // Notification states
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifType, setNotifType] = useState<'info' | 'warning' | 'success'>('info');
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  async function checkAdminAndLoad() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
    
    if (!profile?.is_admin) {
      router.push("/");
      return;
    }

    // Load initial tab data
    loadData('feedbacks');
  }

  async function loadData(tab: string) {
    if (tab === 'feedbacks') {
      const { data } = await supabase
        .from('feedbacks')
        .select(`*, profiles(display_name, email)`)
        .order('created_at', { ascending: false });
      setFeedbacks(data || []);
    } else if (tab === 'users') {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      setUsers(data || []);
    }
    setLoading(false);
  }

  function handleTabSwitch(tab: 'feedbacks' | 'users' | 'notifications') {
    setActiveTab(tab);
    setLoading(true);
    loadData(tab);
  }

  async function handlePushNotification() {
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    setPushing(true);
    
    try {
      const { error } = await supabase.from('notifications').insert({
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        type: notifType
      });
      if (error) throw error;
      
      setPushSuccess(true);
      setNotifTitle("");
      setNotifMessage("");
      setTimeout(() => setPushSuccess(false), 3000);
    } catch (e: any) {
      alert("Failed to push notification: " + e.message);
    } finally {
      setPushing(false);
    }
  }

  async function toggleAdmin(userId: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !currentStatus })
      .eq('id', userId);
    
    if (!error) {
      loadData('users');
    } else {
      alert("Failed to update user admin status.");
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user profile? This action cannot be undone.")) return;
    
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
      
    if (!error) {
      loadData('users');
    } else {
      alert("Failed to delete user: " + error.message);
    }
  }

  if (loading && feedbacks.length === 0 && users.length === 0) {
    return (
      <main className="min-h-screen max-w-lg mx-auto bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </main>
    );
  }

  return (
    <main suppressHydrationWarning className="min-h-screen pb-32 max-w-lg mx-auto bg-background px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-divider text-main hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Shield className="text-brand" size={24} />
          <h1 className="text-xl font-bold text-main">Admin</h1>
        </div>
        <div className="w-10" />
      </div>

      {/* Tabs */}
      <div className="flex bg-surface p-1 rounded-xl border border-divider mb-8 shadow-sm">
        <button
          onClick={() => handleTabSwitch('feedbacks')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'feedbacks' ? 'bg-brand text-white shadow-md' : 'text-subtle hover:text-main'}`}
        >
          <MessageSquare size={16} /> Feedbacks
        </button>
        <button
          onClick={() => handleTabSwitch('users')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'users' ? 'bg-brand text-white shadow-md' : 'text-subtle hover:text-main'}`}
        >
          <Users size={16} /> Users
        </button>
        <button
          onClick={() => handleTabSwitch('notifications')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'notifications' ? 'bg-brand text-white shadow-md' : 'text-subtle hover:text-main'}`}
        >
          <Bell size={16} /> Push
        </button>
      </div>

      {/* Content */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* FEEDBACKS TAB */}
        {activeTab === 'feedbacks' && (
          <div className="space-y-4">
            {feedbacks.length === 0 ? (
              <div className="text-center py-12 text-subtle border border-dashed border-divider rounded-2xl">
                No feedback received yet.
              </div>
            ) : (
              feedbacks.map(fb => (
                <div key={fb.id} className="bg-surface border border-divider rounded-2xl p-5 shadow-sm relative">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-main font-bold text-sm">{fb.profiles?.display_name || 'Anonymous'}</p>
                      <p className="text-subtle text-[10px]">{new Date(fb.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-main text-sm mt-3 whitespace-pre-wrap">{fb.message}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {users.length === 0 ? (
              <div className="text-center py-12 text-subtle border border-dashed border-divider rounded-2xl">
                No users found.
              </div>
            ) : (
              users.map(u => (
                <div key={u.id} className="bg-surface border border-divider rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-main font-bold text-sm">{u.display_name || 'Anonymous'}</p>
                      {u.is_admin && <ShieldAlert size={14} className="text-brand" />}
                    </div>
                    <p className="text-subtle text-xs truncate max-w-[200px]">{u.email || 'No email'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleAdmin(u.id, u.is_admin)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${u.is_admin ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-brand/10 text-brand hover:bg-brand/20'}`}
                    >
                      {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                    </button>
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="p-1.5 text-subtle hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete User"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm">
            <h2 className="text-main font-bold mb-6 flex items-center gap-2">
              <Bell className="text-brand" size={20} />
              Broadcast Notification
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-1 block">Notification Title</label>
                <input
                  type="text"
                  value={notifTitle}
                  onChange={e => setNotifTitle(e.target.value)}
                  placeholder="e.g. Server Maintenance"
                  className="w-full bg-muted border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors"
                />
              </div>

              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-1 block">Message</label>
                <textarea
                  value={notifMessage}
                  onChange={e => setNotifMessage(e.target.value)}
                  placeholder="Detail your announcement here..."
                  className="w-full bg-muted border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors min-h-[100px] resize-none"
                />
              </div>

              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-2 block">Type</label>
                <div className="flex gap-2">
                  {(['info', 'warning', 'success'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setNotifType(type)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all border ${notifType === type ? 'bg-main text-background border-main shadow-md' : 'bg-surface border-divider text-subtle hover:bg-muted'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handlePushNotification}
                disabled={pushing || !notifTitle.trim() || !notifMessage.trim()}
                className="w-full mt-6 bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-brand/20 flex justify-center items-center gap-2"
              >
                {pushing ? "Pushing..." : <><Bell size={18} /> Push Alert</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global Toast */}
      {pushSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-xl border border-brand/30 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50 animate-in slide-in-from-bottom-8 fade-in duration-300">
          <CheckCircle2 className="text-brand" size={20} />
          <p className="text-main font-bold text-sm">Notification Broadcasted!</p>
        </div>
      )}
    </main>
  );
}
