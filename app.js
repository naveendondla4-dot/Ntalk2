const app=document.getElementById("app");
const cfg=window.NTALK_CONFIG||{};
const hasSupabase=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=hasSupabase?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const state={
 user:JSON.parse(localStorage.getItem("ntalk_user")||"null"),
 page:"chats",activeChat:null,theme:localStorage.getItem("ntalk_theme")||"dark",
 chats:[],messages:[],channel:null,presence:null,typingTimer:null,typing:false,call:null,
};
let signalChannel=null,peer=null,localStream=null,remoteStream=null,pendingIce=[];

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>state.user?.id||"";
const meName=()=>state.user?.name||"NTalk User";
const save=()=>localStorage.setItem("ntalk_user",JSON.stringify(state.user));
function setTheme(t){state.theme=t;localStorage.setItem("ntalk_theme",t);render()}
function avatarName(n){return (n||"N").trim()[0]?.toUpperCase()||"N"}

function loginView(){return `<main class="auth"><section class="auth-card">
<div class="brand"><div class="logo">N</div><div><h1>NTalk</h1><p>Connect. Chat. Together.</p></div></div>
<div class="auth-tabs"><button class="active">Login</button><button onclick="registerMode()">Create account</button></div>
<label>Email</label><input id="email" type="email" placeholder="you@example.com">
<label>Password</label><input id="password" type="password" placeholder="••••••••">
<button class="primary wide" onclick="doLogin()">Login</button>
<p class="muted center">${hasSupabase?"Real account mode":"Add Supabase keys in config.js to enable real accounts"}</p>
</section></main>`}
function registerMode(){app.innerHTML=`<main class="auth"><section class="auth-card">
<div class="brand"><div class="logo">N</div><div><h1>NTalk</h1><p>Create your account</p></div></div>
<label>Display name</label><input id="name" placeholder="Your name">
<label>Username</label><input id="username" placeholder="@yourname">
<label>Email</label><input id="email" type="email" placeholder="you@example.com">
<label>Password</label><input id="password" type="password" placeholder="At least 6 characters">
<button class="primary wide" onclick="doRegister()">Create account</button><button class="ghost wide" onclick="render()">Back to login</button>
</section></main>`}

async function doLogin(){
 const email=document.getElementById("email").value.trim(),password=document.getElementById("password").value;
 if(!email||!password)return alert("Enter email and password.");
 if(!hasSupabase)return alert("Add Supabase URL and key in config.js.");
 const {data,error}=await sb.auth.signInWithPassword({email,password});
 if(error)return alert(error.message);
 await loadProfile(data.user); await initBackend(); render();
}
async function doRegister(){
 const name=document.getElementById("name").value.trim()||"NTalk User";
 const username=(document.getElementById("username").value.trim()||"ntalkuser").replace(/^@/,"").toLowerCase();
 const email=document.getElementById("email").value.trim(),password=document.getElementById("password").value;
 if(!email||password.length<6)return alert("Enter valid email and password (6+ characters).");
 if(!hasSupabase)return alert("Add Supabase URL and key in config.js.");
 const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name,username}}});
 if(error)return alert(error.message);
 if(data.user){
   const {error:pe}=await sb.from("profiles").upsert({id:data.user.id,username,display_name:name});
   if(pe) console.warn(pe);
   if(data.session){await loadProfile(data.user);await initBackend();render()}
   else alert("Account created. Check your email if confirmation is enabled, then login.");
 }
}
async function loadProfile(user){
 const {data}=await sb.from("profiles").select("id,username,display_name,avatar_url").eq("id",user.id).maybeSingle();
 state.user={id:user.id,email:user.email,name:data?.display_name||user.user_metadata?.display_name||user.email.split("@")[0],username:"@"+(data?.username||user.user_metadata?.username||user.email.split("@")[0]),avatar_url:data?.avatar_url||null};
 save();
}
async function logout(){try{if(state.channel)await sb.removeChannel(state.channel);if(signalChannel)await sb.removeChannel(signalChannel);await sb.auth.signOut()}catch{} state.user=null;state.chats=[];state.messages=[];localStorage.removeItem("ntalk_user");endCall(false);render()}

function sidebar(){return `<aside class="sidebar"><div class="side-brand"><div class="logo small">N</div><b>NTalk</b><button class="icon-btn" onclick="toggleTheme()">◐</button></div><nav>
<button class="${state.page==="chats"?"selected":""}" onclick="state.page='chats';render()">💬 <span>Chats</span></button>
<button class="${state.page==="calls"?"selected":""}" onclick="state.page='calls';render()">☎ <span>Calls</span></button>
<button class="${state.page==="groups"?"selected":""}" onclick="state.page='groups';render()">👥 <span>Groups</span></button>
<button class="${state.page==="profile"?"selected":""}" onclick="state.page='profile';render()">◉ <span>Profile</span></button></nav>
<div class="side-user"><div class="avatar">${esc(avatarName(meName()))}</div><div><b>${esc(meName())}</b><small>${esc(state.user?.username||"@user")}</small></div></div></aside>`}

function chatList(){return `<section class="chat-list"><header class="list-head"><div><h2>Chats</h2><p>Real-time conversations</p></div><button class="round" onclick="newChat()">＋</button></header>
<div class="search">⌕ <input placeholder="Search people..." oninput="filterChats(this.value)"></div><div id="chatRows">${state.chats.map((c,i)=>chatRow(c,i)).join("")||`<div class="empty-small">No chats yet. Tap ＋ to start.</div>`}</div></section>`}
function chatRow(c,i){return `<button class="chat-row" onclick="openChat(${i})"><div class="avatar ${c.online?"online":""}">${esc(avatarName(c.name))}</div><div class="chat-info"><b>${esc(c.name)}</b><span>${esc(c.msg||"Tap to chat")}</span></div><div class="chat-meta"><small>${esc(c.time||"")}</small>${c.unread?`<em>${c.unread}</em>`:""}</div></button>`}
function filterChats(v){const q=v.toLowerCase();document.getElementById("chatRows").innerHTML=state.chats.filter(c=>(c.name||"").toLowerCase().includes(q)||(c.username||"").toLowerCase().includes(q)).map((c)=>chatRow(c,state.chats.indexOf(c))).join("")}
async function newChat(){
 if(!hasSupabase)return alert("Connect Supabase first.");
 const u=(prompt("Enter their NTalk username (example: @rahul):")||"").trim().replace(/^@/,"").toLowerCase();if(!u)return;
 const {data,error}=await sb.from("profiles").select("id,username,display_name,avatar_url").eq("username",u).maybeSingle();
 if(error||!data)return alert("User not found.");
 if(data.id===uid())return alert("You cannot start a chat with yourself.");
 let c=state.chats.find(x=>x.user_id===data.id);
 if(!c){c={user_id:data.id,name:data.display_name,username:"@"+data.username,avatar:avatarName(data.display_name),online:false,msg:"Tap to chat",time:"now",unread:0};state.chats.unshift(c)}
 state.activeChat=state.chats.indexOf(c);await loadMessages(c);render();
}
async function openChat(i){state.activeChat=i;await loadMessages(state.chats[i]);render();}

async function loadChats(){
 if(!hasSupabase||!uid())return;
 const {data,error}=await sb.from("profiles").select("id,username,display_name,avatar_url").neq("id",uid()).order("display_name");
 if(error){console.warn(error);return}
 // Keep existing conversations and show profiles as discoverable users.
 const existing=new Map(state.chats.map(c=>[c.user_id,c]));
 state.chats=(data||[]).map(p=>existing.get(p.id)||({user_id:p.id,name:p.display_name,username:"@"+p.username,avatar:avatarName(p.display_name),online:false,msg:"Tap to chat",time:"",unread:0}));
}
function conversation(){
 const c=state.chats[state.activeChat];if(!c)return `<div class="empty"><div class="logo">N</div><h2>Select a chat</h2><p>Start a private conversation.</p></div>`;
 return `<section class="conversation"><header class="chat-head"><button class="mobile-back" onclick="state.activeChat=null;render()">‹</button>
<div class="avatar ${c.online?"online":""}">${esc(avatarName(c.name))}</div><div><b>${esc(c.name)}</b><small>${c.typing?"typing…":c.online?"● Online":"Offline"}</small></div>
<div class="head-actions"><button onclick="startCall('voice')">☎</button><button onclick="startCall('video')">▣</button><button onclick="chatInfo()">⋮</button></div></header>
<div id="messages" class="messages">${state.messages.map(messageBubble).join("")||`<div class="empty-chat">No messages yet. Say hello 👋</div>`}</div>
<form class="composer" onsubmit="sendMessage(event)"><button type="button" onclick="emoji()">☺</button><input id="msg" autocomplete="off" placeholder="Type a message..." oninput="typingChanged(this.value)"><label class="attach">＋<input id="file" type="file" hidden onchange="uploadMedia(this.files[0])"></label><button class="send" type="submit">➤</button></form></section>`
}
function messageBubble(m){return `<div class="bubble ${m.sender_id===uid()?"me":"them"}">${m.file_url?`<a href="${esc(m.file_url)}" target="_blank">${m.file_type?.startsWith("image/")?`<img class="media" src="${esc(m.file_url)}">`:`📎 ${esc(m.file_name||"File")}`}</a>`:`<div>${esc(m.content)}</div>`}<small>${new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} ${m.sender_id===uid()?"✓✓":""}</small></div>`}
async function loadMessages(c){
 if(!hasSupabase||!c)return;
 const {data,error}=await sb.from("messages").select("*").or(`and(sender_id.eq.${uid()},receiver_id.eq.${c.user_id}),and(sender_id.eq.${c.user_id},receiver_id.eq.${uid()})`).order("created_at");
 if(error){console.warn(error);state.messages=[];return}
 state.messages=data||[]; await sb.from("messages").update({seen_at:new Date().toISOString()}).eq("sender_id",c.user_id).eq("receiver_id",uid()).is("seen_at",null);
}
async function sendMessage(e){
 e.preventDefault();const input=document.getElementById("msg"),text=input.value.trim(),c=state.chats[state.activeChat];if(!text||!c)return;
 if(!hasSupabase)return alert("Connect Supabase first.");
 const {data,error}=await sb.from("messages").insert({sender_id:uid(),receiver_id:c.user_id,content:text}).select().single();
 if(error)return alert(error.message);state.messages.push(data);input.value="";await notifyTyping(false);render();scrollMessages();
}
function scrollMessages(){setTimeout(()=>{const m=document.getElementById("messages");if(m)m.scrollTop=m.scrollHeight},50)}
function emoji(){const i=document.getElementById("msg");if(i){i.value+=" 😊";i.focus()}}
function chatInfo(){const c=state.chats[state.activeChat];alert(`${c.name}\n${c.username||""}`)}

async function uploadMedia(file){
 const c=state.chats[state.activeChat];if(!file||!c||!hasSupabase)return;
 const ext=file.name.split(".").pop();const path=`${uid()}/${crypto.randomUUID()}.${ext}`;
 const {error}=await sb.storage.from("ntalk-media").upload(path,file,{contentType:file.type,upsert:false});
 if(error)return alert(error.message);
 const {data}=sb.storage.from("ntalk-media").getPublicUrl(path);
 const r=await sb.from("messages").insert({sender_id:uid(),receiver_id:c.user_id,content:"",file_url:data.publicUrl,file_name:file.name,file_type:file.type}).select().single();
 if(r.error)return alert(r.error.message);state.messages.push(r.data);render();scrollMessages();
}

async function setupRealtime(){
 if(!hasSupabase||!uid())return;
 if(state.channel)await sb.removeChannel(state.channel);
 const c=state.chats[state.activeChat]?.user_id;
 state.channel=sb.channel("ntalk-user-"+uid())
 .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`receiver_id=eq.${uid()}`},async payload=>{
   const m=payload.new;const chat=state.chats.find(x=>x.user_id===m.sender_id);
   if(chat&&m.sender_id===c){state.messages.push(m);await sb.from("messages").update({delivered_at:new Date().toISOString()}).eq("id",m.id);render();scrollMessages()}
   else if(chat){chat.unread=(chat.unread||0)+1;chat.msg=m.content||"📎 Media";chat.time="now";render()}
 })
 .on("broadcast",{event:"typing"},({payload})=>{const chat=state.chats.find(x=>x.user_id===payload.from);if(chat){chat.typing=payload.value;if(state.activeChat!==null&&chat.user_id===c)render()}})
 .subscribe();
}
async function notifyTyping(value){
 const c=state.chats[state.activeChat];if(!state.channel||!c)return;
 await state.channel.send({type:"broadcast",event:"typing",payload:{from:uid(),to:c.user_id,value}});
}
function typingChanged(v){clearTimeout(state.typingTimer);notifyTyping(!!v);if(v)state.typingTimer=setTimeout(()=>notifyTyping(false),1200)}

async function initPresence(){
 if(!hasSupabase||!uid())return;
 const ch=sb.channel("ntalk-presence",{config:{presence:{key:uid()}}});
 ch.on("presence",{event:"sync"},()=>{const p=ch.presenceState();state.chats.forEach(c=>c.online=!!p[c.user_id])}).on("presence",{event:"join"},({key})=>{const c=state.chats.find(x=>x.user_id===key);if(c){c.online=true;render()}}).on("presence",{event:"leave"},({key})=>{const c=state.chats.find(x=>x.user_id===key);if(c){c.online=false;render()}});
 await ch.subscribe(async status=>{if(status==="SUBSCRIBED")await ch.track({online_at:new Date().toISOString()})});
 state.presence=ch;
}

function callsView(){return `<section class="full-page"><header><h2>Calls</h2><button class="round" onclick="newCallTarget('voice')">＋</button></header><div class="call-card"><div class="avatar">☎</div><div><b>NTalk Calls</b><small>Voice and video calling via WebRTC</small></div><button onclick="newCallTarget('voice')">☎</button><button onclick="newCallTarget('video')">▣</button></div></section>`}
function groupsView(){return `<section class="full-page"><header><h2>Groups</h2></header><div class="group-card"><div class="avatar">👥</div><div><b>Groups</b><small>Group database UI is prepared; group messaging can be expanded from the same messages architecture.</small></div></div></section>`}
function profileView(){return `<section class="full-page profile"><header><h2>Profile</h2><button onclick="logout()" class="danger-text">Logout</button></header><div class="profile-top"><div class="profile-avatar">${esc(avatarName(meName()))}</div><h2>${esc(meName())}</h2><p>${esc(state.user?.username||"@user")}</p><span class="status">● Account active</span></div><div class="settings-card"><button onclick="installApp()">Install NTalk <span>＋</span></button><button onclick="toggleTheme()">Appearance: ${state.theme==="dark"?"Dark":"Light"} <span>›</span></button><button onclick="alert('Email: '+state.user.email)">Account <span>›</span></button></div></section>`}

async function newCallTarget(type="voice"){
 const u=(prompt("Enter NTalk username:")||"").trim().replace(/^@/,"").toLowerCase();if(!u)return;
 const c=state.chats.find(x=>x.username?.replace(/^@/,"")===u);
 if(c){state.activeChat=state.chats.indexOf(c);render();startCall(type);return}
 if(!hasSupabase)return alert("Connect Supabase first.");
 const {data,error}=await sb.from("profiles").select("id,username,display_name").eq("username",u).maybeSingle();
 if(error||!data)return alert("User not found.");
 state.chats.unshift({user_id:data.id,name:data.display_name,username:"@"+data.username,avatar:avatarName(data.display_name),online:false,msg:"Ready to call",time:"now",unread:0});
 state.activeChat=0;render();startCall(type);
}
function rtcConfig(){const ice=[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}];if(cfg.TURN_URL)ice.push({urls:cfg.TURN_URL,username:cfg.TURN_USERNAME,credential:cfg.TURN_CREDENTIAL});return{iceServers:ice}}
async function setupSignaling(){
 if(!hasSupabase||!state.user)return;if(signalChannel)await sb.removeChannel(signalChannel);
 signalChannel=sb.channel("ntalk-call-signal",{config:{broadcast:{self:false}}});
 signalChannel.on("broadcast",{event:"call"},async({payload})=>{if(payload.to!==uid())return;await onSignal(payload)});await signalChannel.subscribe()
}
async function signal(payload){if(signalChannel)await signalChannel.send({type:"broadcast",event:"call",payload:{...payload,from:uid(),fromName:meName()}})}
function callTarget(){return state.chats[state.activeChat]?.user_id}
async function startCall(type){
 const to=callTarget();if(!to)return newCallTarget(type);
 if(!navigator.mediaDevices?.getUserMedia)return alert("Microphone/camera access is unavailable.");
 await beginLocalMedia(type);state.call={role:"caller",type,to,otherName:state.chats[state.activeChat].name,status:"Calling…"};showCallOverlay();
 peer=new RTCPeerConnection(rtcConfig());localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
 peer.onicecandidate=e=>e.candidate&&signal({kind:"ice",to,candidate:e.candidate});peer.ontrack=e=>attachRemote(e.streams[0]);peer.onconnectionstatechange=()=>updateCallStatus(peer.connectionState);
 const offer=await peer.createOffer();await peer.setLocalDescription(offer);await signal({kind:"offer",to,type,offer:{type:offer.type,sdp:offer.sdp}});
}
async function beginLocalMedia(type){localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==="video"})}
async function onSignal(p){
 if(p.kind==="offer"){if(state.call)return;state.call={role:"callee",type:p.type,to:p.from,otherName:p.fromName||"NTalk user",status:"Incoming call",offer:p.offer};renderIncomingCall()}
 else if(p.kind==="answer"&&peer){await peer.setRemoteDescription(p.answer);await flushIce()}
 else if(p.kind==="ice"&&peer){if(peer.remoteDescription)await peer.addIceCandidate(p.candidate);else pendingIce.push(p.candidate)}
 else if(p.kind==="reject"||p.kind==="hangup")endCall(true)
}
async function acceptCall(){const c=state.call;await beginLocalMedia(c.type);peer=new RTCPeerConnection(rtcConfig());localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));peer.onicecandidate=e=>e.candidate&&signal({kind:"ice",to:c.to,candidate:e.candidate});peer.ontrack=e=>attachRemote(e.streams[0]);peer.onconnectionstatechange=()=>updateCallStatus(peer.connectionState);await peer.setRemoteDescription(c.offer);await flushIce();const answer=await peer.createAnswer();await peer.setLocalDescription(answer);await signal({kind:"answer",to:c.to,answer:{type:answer.type,sdp:answer.sdp}});c.status="Connecting…";showCallOverlay()}
async function flushIce(){while(pendingIce.length)await peer.addIceCandidate(pendingIce.shift())}
function attachRemote(stream){remoteStream=stream;const v=document.getElementById("remoteVideo");if(v){v.srcObject=stream;v.play?.().catch(()=>{})}document.getElementById("remoteAvatar")?.classList.add("hidden")}
function updateCallStatus(s){if(!state.call)return;state.call.status=s==="connected"?"Connected":s==="failed"?"Connection failed":state.call.status;const e=document.getElementById("callStatus");if(e)e.textContent=state.call.status}
function showCallOverlay(){document.querySelector(".call-overlay")?.remove();const c=state.call,video=c.type==="video";app.insertAdjacentHTML("beforeend",`<div class="call-overlay ${video?"video":""}"><button class="close-call" onclick="endCall(true)">×</button><div class="call-main">${video?`<video id="remoteVideo" class="remote-video" autoplay playsinline></video><div id="remoteAvatar" class="video-avatar">${esc(avatarName(c.otherName))}</div><video id="localVideo" class="local-video" autoplay muted playsinline></video>`:`<div id="remoteAvatar" class="call-avatar">${esc(avatarName(c.otherName))}</div>`}<h1>${video?"Video Call":"Voice Call"}</h1><h2>${esc(c.otherName)}</h2><p id="callStatus">${esc(c.status)}</p><div class="call-controls"><button onclick="toggleMute()">🎤</button>${video?'<button onclick="toggleCamera()">📷</button>':""}<button class="end" onclick="endCall(true)">☎</button></div></div></div>`);if(video&&localStream){const v=document.getElementById("localVideo");v.srcObject=localStream;v.play?.().catch(()=>{})}}
function renderIncomingCall(){document.querySelector(".call-overlay")?.remove();const c=state.call;app.insertAdjacentHTML("beforeend",`<div class="call-overlay incoming"><div class="incoming-card"><div class="call-avatar">${esc(avatarName(c.otherName))}</div><h2>${esc(c.otherName)}</h2><p>Incoming ${c.type==="video"?"video":"voice"} call</p><div class="incoming-actions"><button class="reject" onclick="rejectCall()">✕</button><button class="accept" onclick="acceptCall()">✓</button></div></div></div>`)}
async function rejectCall(){const c=state.call;if(c)await signal({kind:"reject",to:c.to});endCall(false)}
async function endCall(send=true){const c=state.call;if(send&&c?.to)await signal({kind:"hangup",to:c.to});try{peer?.close()}catch{}peer=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;remoteStream=null;pendingIce=[];state.call=null;document.querySelector(".call-overlay")?.remove()}
function toggleMute(){const t=localStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;event.currentTarget.textContent=t.enabled?"🎤":"🔇"}}
function toggleCamera(){const t=localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;event.currentTarget.textContent=t.enabled?"📷":"🚫"}}

let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e});
async function installApp(){if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else alert("If your browser supports installation, use the browser menu → Install app / Add to Home screen.")}
function toggleTheme(){setTheme(state.theme==="dark"?"light":"dark")}

async function initBackend(){
 await loadChats();await setupRealtime();await initPresence();await setupSignaling();
}
function render(){
 document.body.dataset.theme=state.theme;
 if(!state.user){app.innerHTML=loginView();return}
 const center=state.page==="calls"?callsView():state.page==="groups"?groupsView():state.page==="profile"?profileView():chatList();
 app.innerHTML=`<div class="shell">${sidebar()}<main class="main">${center}${state.page==="chats"&&state.activeChat!==null?conversation():state.page==="chats"?`<div class="empty"><div class="logo">N</div><h2>Select a chat</h2><p>Choose a person from the list or tap ＋.</p></div>`:""}</main></div>`;
 scrollMessages();
}
window.addEventListener("load",async()=>{
 if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
 if(hasSupabase){const {data}=await sb.auth.getSession();if(data.session){await loadProfile(data.session.user);await initBackend()}}
 render();
});
