const fs = require('fs');
const file = 'app/room/[id]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const amIPayerIdx = content.indexOf('{amIPayer ? (\\n            // Payer view — see who\\'s paid\\n            <div className="space-y-4">');

// We are going to extract the payer block up to "Settle Receipt" area.
// Let's replace the first ternary:
let newContent = content.replace(
  '{amIPayer ? (\\n            // Payer view — see who\\'s paid\\n            <div className="space-y-4">',
  '          {/* Collection and Participation Summary (Visible to everyone) */}\\n          <div className="space-y-4">'
);

// Fix the line inside Collection summary that checks myName:
newContent = newContent.replace(
  'if (p.name === myName) return;\\n                  const pTotal',
  'if (p.name === session.paidBy) return;\\n                  const pTotal'
);

// Now we need to hide the remove participant button from non-payers in the participant status list:
newContent = newContent.replace(
  '{session.status !== "done" && (\\n                                <button\\n                                  onClick={(e)',
  '{amIPayer && session.status !== "done" && (\\n                                <button\\n                                  onClick={(e)'
);

// We need to find the boundary where the Payer view ends and Non-Payer view begins.
// The Payer view ends with the Settle Receipt button:
//               {session.status !== "done" ? ( ... ) : ( ... )}
//             </div>
//           ) : (() => { // Non-payer view

const findStr = '              {session.status !== "done" ? (\\n                <div className="mt-8">';
newContent = newContent.replace(
  findStr,
  '              {amIPayer && (session.status !== "done" ? (\\n                <div className="mt-8">'
);

const endStr = '                </div>\\n              )}\\n            </div>\\n          ) : (() => {\\n            // Non-payer view';
newContent = newContent.replace(
  endStr,
  '                </div>\\n              )))}\\n            </div>\\n\\n          {/* Non-payer payment flow */}\\n          {!amIPayer && (() => {\\n            // Non-payer view'
);

// And we must replace the closing brace of the Non-Payer view:
//                 </div>
//               </div>
//             );
//           })()}
//         </div>
//       )}

const endNonPayerStr = '                </div>\\n              </div>\\n            );\\n          })()}\\n        </div>\\n      )}';
newContent = newContent.replace(
  endNonPayerStr,
  '                </div>\\n              </div>\\n            );\\n          })()}\\n        </div>\\n      )}'
);

fs.writeFileSync(file, newContent, 'utf8');
console.log("Restructuring complete!");
