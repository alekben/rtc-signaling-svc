/******************************
 * Agora RTM 2.x DEMO (Signaling 2.x)
 ******************************/
let rtmClient = null;
let rtmChannel = null;

// RTC Client
let rtcClient = null;
let localAudioTrack = null;
let localVideoTrack = null;

let localInbox = ""; // "inbox_userX"
let subscribedChannel = null; // e.g. "testChannel"

// DOM elements
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const sendChannelMsgBtn = document.getElementById("sendChannelMsgBtn");
const sendPeerMsgBtn = document.getElementById("sendPeerMsgBtn");

const appIdInput = "a9a4b25e4e8b4a558aa39780d1a84342";

const userIdInput = document.getElementById("userId");
const channelNameInput = document.getElementById("channelName");
const channelMsgInput = document.getElementById("channelMsg");
const peerIdInput = document.getElementById("peerId");
const peerMsgInput = document.getElementById("peerMsg");

const loginStatus = document.getElementById("loginStatus");
const channelStatus = document.getElementById("channelStatus");
const channelChatBox = document.getElementById("channelChatBox");
const peerChatBox = document.getElementById("peerChatBox");

// Video Elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// Modal Elements
const loginModal = document.getElementById("loginModal");
const inviteModal = document.getElementById("inviteModal");
const showLoginBtn = document.getElementById("showLoginBtn");
const inviteLinkInput = document.getElementById("inviteLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const closeInviteModalBtn = document.getElementById("closeInviteModalBtn");

// Tab Elements
const tabBtns = document.querySelectorAll(".tab-btn");
const chatPanels = document.querySelectorAll(".chat-panel");

// Simplified RTM config
const rtmConfig = {
  presenceTimeout: 30, // in seconds
  logUpload: false,
  logLevel: "debug",
  cloudProxy: false,
  useStringUserId: true,
};

// Add new variables for participant management
let participants = new Set();
const participantsList = document.getElementById("participantsList");
const presenceIndicator = document.getElementById("presenceIndicator");

// Add new variables for device selection
let audioDevices = [];
let videoDevices = [];
const deviceModal = document.getElementById("deviceModal");
const showDeviceBtn = document.getElementById("showDeviceBtn");
const closeDeviceBtn = document.getElementById("closeDeviceBtn");
const audioSelect = document.getElementById("audioSelect");
const videoSelect = document.getElementById("videoSelect");

// Add new variables for message notifications
let unreadChannelMessages = 0;
let unreadPeerMessages = 0;
const channelTab = document.querySelector('[data-tab="channel"]');
const peerTab = document.querySelector('[data-tab="peer"]');

// Add new variables for video management
const additionalVideos = document.getElementById("additionalVideos");
let remoteVideos = new Map(); // Map to track remote video elements

// Update the video elements to include labels
const localVideoLabel = document.createElement("div");
localVideoLabel.className = "video-label";
localVideoLabel.textContent = userIdInput.value || "Local Video";
localVideo.appendChild(localVideoLabel);

// Function to create a new video element with label
function createVideoElement(userId) {
  const videoElement = document.createElement("div");
  videoElement.className = "video-player";
  
  const videoLabel = document.createElement("div");
  videoLabel.className = "video-label";
  videoLabel.textContent = userId;
  videoElement.appendChild(videoLabel);
  
  return videoElement;
}

// Function to update video labels
function updateVideoLabels() {
  // Update local video label with current user ID
  if (userIdInput.value) {
    localVideoLabel.textContent = userIdInput.value;
  }
  
  // Update remote video labels
  remoteVideos.forEach((video, userId) => {
    const label = video.querySelector(".video-label");
    if (label) {
      label.textContent = userId;
    }
  });
}

// Add new RTC control buttons
const leaveMeetingBtn = document.getElementById("logoutBtn");
const toggleAudioBtn = document.getElementById("toggleAudioBtn");
const toggleVideoBtn = document.getElementById("toggleVideoBtn");

/** Append text message in any chatbox. */
function addChatMessage(container, text) {
  const div = document.createElement("div");
  div.className = "chat-message";
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/** Login to RTM (Signaling 2.x). */
loginBtn.addEventListener("click", async () => {
  const appId = appIdInput;
  const token = null;
  const userId = userIdInput.value.trim();

  if (!appId || !userId) {
    alert("Please provide App ID and User ID");
    return;
  }

  try {
    // Show loading state
    document.querySelector('.modal-content').classList.add('loading');
    
    // Create and initialize RTM client
    const { RTM } = AgoraRTM;
    rtmClient = new RTM(appId, userId, rtmConfig);

    // Set up RTM event listeners
    rtmClient.addEventListener("status", (evt) => {
      console.log("RTM Status Event:", evt);
      updatePresenceIndicator(evt.state === "CONNECTED");
      loginStatus.textContent = `Connected to ${channelNameInput.value}`;
    });

    rtmClient.addEventListener("message", handleRtmChannelMessage);
    rtmClient.addEventListener("presence", handleRtmPresenceEvent);

    // Login to RTM
    await rtmClient.login({ token });
    localInbox = "inbox_" + userId;

    // Subscribe to personal inbox
    await rtmClient.subscribe(localInbox, {
      withMessage: true,
      withPresence: false,
      withMetadata: false,
      withLock: false,
    });

    // Enable UI
    logoutBtn.disabled = false;
    sendPeerMsgBtn.disabled = false;

    await subscribeRTM();

    //set vp9 svc
    AgoraRTC.setParameter("SVC",["vp9"]);
    AgoraRTC.setParameter("ENABLE_AUT_CC", true);

    // Initialize RTC only after successful RTM login
    await initializeRTC(appId, token, userId);

    await joinChannel();
    
    // Update participants list to include local user
    updateParticipantsList();
    
    // Hide login modal
    hideModal();
  } catch (err) {
    console.error("Login failed:", err);
    alert("Login failed: " + err.message);
    // Remove loading state on error
    document.querySelector('.modal-content').classList.remove('loading');
  }
});

/** Logout & cleanup. */
logoutBtn.addEventListener("click", async () => {
  try {
    // Clean up RTM
    if (subscribedChannel) {
      await rtmClient.unsubscribe(subscribedChannel);
    }
    if (localInbox) {
      await rtmClient.unsubscribe(localInbox);
    }
    await rtmClient.logout();

    // Clean up RTC
    if (rtcClient) {
      await rtcClient.leave();
    }

    // Reset state
    rtmClient = null;
    rtcClient = null;
    participants.clear();
    updateParticipantsList();
    updatePresenceIndicator(false);

    // Hide remote video container
    remoteVideo.classList.remove('has-remote');

    // Update UI
    loginStatus.textContent = "Not logged in";
    logoutBtn.disabled = true;
    sendChannelMsgBtn.disabled = true;
    sendPeerMsgBtn.disabled = true;

    // Show login modal
    showModal();
  } catch (err) {
    console.error("Logout error:", err);
  }
});

/** Subscribe to a channel (with messages + presence). */
async function subscribeRTM() {
  if (!rtmClient) {
    alert("Please login first!");
    return;
  }
  const channelName = channelNameInput.value.trim();
  if (!channelName) {
    alert("Channel name required");
    return;
  }

  try {
    subscribedChannel = channelName;
    // Subscribe to RTM channel
    await rtmClient.subscribe(channelName, {
      withMessage: true,
      withPresence: true,
      withMetadata: false,
      withLock: false,
    });

    // Enable UI
    sendChannelMsgBtn.disabled = false;// Enable RTC join button after signaling subscription

  } catch (err) {
    console.error("Channel subscription failed:", err);
    alert("Channel subscription failed: " + err.message);
  }
};



/** Publish a message to the subscribed channel. */
sendChannelMsgBtn.addEventListener("click", async () => {
  if (!rtmClient || !subscribedChannel) {
    alert("Subscribe to a channel first!");
    return;
  }
  const msg = channelMsgInput.value.trim();
  if (!msg) return;
  try {
    await rtmClient.publish(subscribedChannel, msg);
    addChatMessage(channelChatBox, `[You]: ${msg}`);
    channelMsgInput.value = "";
  } catch (err) {
    console.error("Publish error:", err);
  }
});

/** Send a direct P2P message by publishing to "inbox_<peerId>" channel. */
sendPeerMsgBtn.addEventListener("click", async () => {
  if (!rtmClient) {
    alert("Login first!");
    return;
  }
  const peerId = peerIdInput.value.trim();
  if (!peerId) {
    alert("Peer ID is required");
    return;
  }
  const message = peerMsgInput.value.trim();
  if (!message) return;

  // P2P is just "publish" to their "inbox_peerID" channel
  const peerInbox = "inbox_" + peerId;
  try {
    await rtmClient.publish(peerInbox, message);
    addChatMessage(peerChatBox, `[To ${peerId}]: ${message}`);
    peerMsgInput.value = "";
  } catch (err) {
    console.error("Send peer message error:", err);
  }
});

/** Handle channel messages from RTM 2.x events. */
function handleRtmChannelMessage(evt) {
  const { channelType, channelName, publisher, message } = evt;
  
  // Format timestamp
  const timestamp = new Date().toLocaleTimeString();
  
  // If it's your personal inbox => that's a "peer message"
  if (channelName === localInbox) {
    addChatMessage(peerChatBox, `[${timestamp}] [From ${publisher}]: ${message}`);
    return;
  }

  // Skip if the message is from the current user (we already showed it locally)
  if (publisher === userIdInput.value) {
    return;
  }

  // Otherwise, it's a normal channel message
  addChatMessage(channelChatBox, `[${timestamp}] [${publisher}]: ${message}`);
}

/** Handle presence events (join/leave/timeouts) from RTM 2.x. */
function handleRtmPresenceEvent(evt) {
  const { eventType, publisher, channelName, timestamp, snapshot } = evt;
  
  // Format timestamp
  const timeStr = new Date(parseInt(timestamp)).toLocaleTimeString();

  if (channelName === subscribedChannel) {
    // Handle snapshot event
    if (eventType === "SNAPSHOT" && snapshot) {
      // Clear existing participants
      participants.clear();
      
      // Add all users from snapshot except current user
      snapshot.forEach(user => {
        if (user.userId !== userIdInput.value) {
          participants.add(user.userId);
          addChatMessage(channelChatBox, `[${timeStr}] [System] ${user.userId} joined the meeeting.`);
        }
      });
      
      updateParticipantsList();
      return;
    }

    // Handle join events (both initial and remote)
    if (eventType === "JOIN" || eventType === "REMOTE_JOIN") {
      // Skip if it's our own join event
      if (publisher !== userIdInput.value) {
        participants.add(publisher);
        addChatMessage(channelChatBox, `[${timeStr}] [System] ${publisher} joined the channel`);
        updateParticipantsList();
      }
    } 
    // Handle leave events (both types) and timeouts
    else if (eventType === "LEAVE" || eventType === "REMOTE_LEAVE" || eventType === "REMOTE_TIMEOUT") {
      // Skip if it's our own leave event
      if (publisher !== userIdInput.value) {
        participants.delete(publisher);
        addChatMessage(channelChatBox, `[${timeStr}] [System] ${publisher} left the meeting.`);
        updateParticipantsList();
      }
    }
  }
}

// RTC Event Handlers
async function initializeRTC(appId, token, userId) {
  try {
    if (rtcClient) {
      await rtcClient.leave();
    }

    rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp9" });

    // Set up RTC event listeners
    rtcClient.on("user-published", async (user, mediaType) => {
      await rtcClient.subscribe(user, mediaType);
      
      // Show remote video container when first user publishes
      if (!remoteVideo.classList.contains('has-remote')) {
        remoteVideo.classList.add('has-remote');
      }
      
      // Create or get video element for this user
      let videoElement;
      if (!remoteVideos.has(user.uid)) {
        videoElement = createVideoElement(user.uid);
        remoteVideos.set(user.uid, videoElement);
        updateVideoGrid();
      } else {
        videoElement = remoteVideos.get(user.uid);
      }
      
      if (mediaType === "video") {
        user.videoTrack.play(videoElement);
      }
      else if (mediaType === "audio") {
        user.audioTrack.play();
      }
    });

    rtcClient.on("user-unpublished", (user, mediaType) => {
      // Only stop the specific track type that was unpublished
      if (mediaType === "video" && user.videoTrack) {
        user.videoTrack.stop();
        
        // Remove video element if it exists
        if (remoteVideos.has(user.uid)) {
          const video = remoteVideos.get(user.uid);
          if (video.parentNode) {
            video.parentNode.removeChild(video);
          }
          remoteVideos.delete(user.uid);
          updateVideoGrid();
        }
      }
      else if (mediaType === "audio" && user.audioTrack) {
        user.audioTrack.stop();
      }

      // Hide remote video container if no more remote users
      if (remoteVideos.size === 0) {
        remoteVideo.classList.remove('has-remote');
      }
    });

    // Also handle user-left event to remove video tiles
    rtcClient.on("user-left", (user) => {
      if (remoteVideos.has(user.uid)) {
        const video = remoteVideos.get(user.uid);
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
        remoteVideos.delete(user.uid);
        updateVideoGrid();
      }

      // Hide remote video container if no more remote users
      if (remoteVideos.size === 0) {
        remoteVideo.classList.remove('has-remote');
      }
    });

    // Only join if we have a channel name
    if (channelNameInput.value.trim()) {
      await rtcClient.join(appId, channelNameInput.value, token, userId);
    }
  } catch (error) {
    console.error("RTC initialization failed:", error);
    if (error.message.includes("UID_CONFLICT")) {
      alert(
        "UID conflict detected. Please log out and try again with a different user ID."
      );
    }
  }
}


// UI Update Functions
function updateLoginStatus(state) {
  loginStatus.textContent = `Login Status: ${state}`;
  if (state === "CONNECTED") {
    loginBtn.disabled = true;
    logoutBtn.disabled = false;
  }
}

function updateChannelStatus(message) {
  channelStatus.textContent = message;
}

function enableChannelControls(enabled) {

  channelMsgInput.disabled = !enabled;
  sendChannelMsgBtn.disabled = !enabled;
}

function enableVideoControls(enabled) {
  toggleAudioBtn.disabled = !enabled;
  toggleVideoBtn.disabled = !enabled;
}

// Message Display Functions
function displayChannelMessage(senderId, message) {
  const messageElement = document.createElement("div");
  messageElement.className = `message ${
    senderId === userIdInput.value ? "self" : "other"
  }`;
  messageElement.textContent = `${senderId}: ${message}`;
  channelChatBox.appendChild(messageElement);
  channelChatBox.scrollTop = channelChatBox.scrollHeight;
}

function displaySystemMessage(container, message) {
  const messageElement = document.createElement("div");
  messageElement.className = "message system";
  messageElement.textContent = message;
  container.appendChild(messageElement);
  container.scrollTop = container.scrollHeight;
}

// Modal Functions
function showModal() {
  loginModal.style.display = "block";
  // Remove loading state if it exists
  document.querySelector('.modal-content').classList.remove('loading');
  // Add blur effect to all content except modal
  document.querySelectorAll('.container > *:not(.modal)').forEach(element => {
    element.classList.add('blur-background');
  });
}

function hideModal() {
  loginModal.style.display = "none";
  // Remove loading state
  document.querySelector('.modal-content').classList.remove('loading');
  // Remove blur effect from all content
  document.querySelectorAll('.blur-background').forEach(element => {
    element.classList.remove('blur-background');
  });
}

function showInviteModal() {
  // Generate invite link with current channel
  const currentUrl = window.location.href.split('?')[0];
  const inviteUrl = `${currentUrl}?channel=${encodeURIComponent(channelNameInput.value)}`;
  inviteLinkInput.value = inviteUrl;
  
  inviteModal.style.display = "block";
  // Add blur effect to all content except modal
  document.querySelectorAll('.container > *:not(.modal)').forEach(element => {
    element.classList.add('blur-background');
  });
}

function hideInviteModal() {
  inviteModal.style.display = "none";
  // Remove blur effect from all content
  document.querySelectorAll('.blur-background').forEach(element => {
    element.classList.remove('blur-background');
  });
}

// Function to get URL parameters
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Show modal when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Check for URL parameters
  const channelParam = getUrlParameter('channel');
  const userParam = getUrlParameter('user');

  // If channel parameter exists, set it and make input readonly
  if (channelParam) {
    channelNameInput.value = decodeURIComponent(channelParam);
    channelNameInput.readOnly = true;
  } else {
    channelNameInput.readOnly = false;
  }

  // If user parameter exists, set it
  if (userParam) {
    userIdInput.value = decodeURIComponent(userParam);
  }

  // Validate login button state based on userId input
  validateLoginButton();

  // Add input event listener to userId input to validate button state
  userIdInput.addEventListener('input', validateLoginButton);

  showModal();
});

// Function to validate login button state
function validateLoginButton() {
  // Disable login button if userId is empty
  loginBtn.disabled = userIdInput.value.trim() === '';
}

// Event Listeners for Invite Modal
showLoginBtn.addEventListener("click", () => {
  console.log("Meeting Settings button clicked");
  console.log("showLoginBtn element:", showLoginBtn);
  console.log("inviteModal element:", inviteModal);
  showInviteModal();
});
closeInviteModalBtn.addEventListener("click", hideInviteModal);

copyLinkBtn.addEventListener("click", () => {
  inviteLinkInput.select();
  document.execCommand("copy");
  
  // Show feedback
  const originalText = copyLinkBtn.textContent;
  copyLinkBtn.textContent = "Copied!";
  setTimeout(() => {
    copyLinkBtn.textContent = originalText;
  }, 2000);
});

// Tab Functions
function switchTab(tabId) {
  tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  chatPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${tabId}Chat`);
  });
}

// Event Listeners for Tabs
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// Add participant management functions
function updatePresenceIndicator(isOnline) {
  presenceIndicator.className = `presence-indicator ${
    isOnline ? "online" : "offline"
  }`;
}

function updateParticipantsList() {
  const participantsList = document.getElementById("participantsList");
  participantsList.innerHTML = "";
  
  // Add local user first
  const localUserElement = document.createElement("div");
  localUserElement.className = "participant-item";
  localUserElement.innerHTML = `
    <span class="presence-indicator online"></span>
    <span>${userIdInput.value} (You)</span>
  `;
  participantsList.appendChild(localUserElement);
  
  // Add remote participants
  participants.forEach((participant) => {
    const participantElement = document.createElement("div");
    participantElement.className = "participant-item";
    participantElement.innerHTML = `
      <span class="presence-indicator online"></span>
      <span>${participant}</span>
    `;
    
    // Add click handler to populate peer chat
    participantElement.addEventListener("click", () => {
      peerIdInput.value = participant;
      // Switch to peer chat tab
      const peerTab = document.querySelector('[data-tab="peer"]');
      if (peerTab) {
        peerTab.click();
      }
    });
    
    participantsList.appendChild(participantElement);
  });
  
  // Update remote video labels if needed
  remoteVideos.forEach((video, userId) => {
    const label = video.querySelector(".video-label");
    if (label && participants.has(userId)) {
      label.textContent = userId;
    }
  });
}

// Add device selection functions
async function loadDevices() {
  try {
    audioDevices = await AgoraRTC.getMicrophones();
    videoDevices = await AgoraRTC.getCameras();

    audioSelect.innerHTML = audioDevices
      .map(
        (device) =>
          `<option value="${device.deviceId}">${
            device.label || `Microphone ${device.deviceId}`
          }</option>`
      )
      .join("");

    videoSelect.innerHTML = videoDevices
      .map(
        (device) =>
          `<option value="${device.deviceId}">${
            device.label || `Camera ${device.deviceId}`
          }</option>`
      )
      .join("");
  } catch (error) {
    console.error("Error loading devices:", error);
  }
}

async function switchAudioDevice(deviceId) {
  if (localAudioTrack) {
    await localAudioTrack.setDevice(deviceId);
  }
}

async function switchVideoDevice(deviceId) {
  if (localVideoTrack) {
    await localVideoTrack.setDevice(deviceId);
  }
}

// Add event listeners for device selection
audioSelect.addEventListener("change", (e) =>
  switchAudioDevice(e.target.value)
);
videoSelect.addEventListener("change", (e) =>
  switchVideoDevice(e.target.value)
);

// Modal functions for device selection
function showDeviceModal() {
  deviceModal.style.display = "block";
  loadDevices();
}

function hideDeviceModal() {
  deviceModal.style.display = "none";
}

// Add event listeners for device modal
showDeviceBtn.addEventListener("click", showDeviceModal);
//closeDeviceBtn.addEventListener("click", hideDeviceModal);

// Add RTC control event listeners
async function joinChannel() {
  const channelName = channelNameInput.value.trim();
  if (!channelName) {
    alert("Please enter a channel name");
    return;
  }
  if (!rtcClient) {
    alert("Please login first");
    return;
  }
  if (!subscribedChannel) {
    alert("Please subscribe to the channel first");
    return;
  }
  try {
    // Create and publish tracks
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localVideoTrack = await AgoraRTC.createCameraVideoTrack({encoderConfig: "720p_3", scalabiltyMode: "3SL3TL"});
    
    // Play local video
    localVideoTrack.play(localVideo);
    
    // Join channel and publish tracks
    //await rtcClient.join(
    //  appIdInput,
    //  channelName,
    //  null,
    //  userIdInput.value
    //);
    
    // Publish tracks
    await rtcClient.publish([localAudioTrack, localVideoTrack]);
    
    // Enable controls and set initial states
    logoutBtn.disabled = false;
    toggleVideoBtn.disabled = false;
    toggleAudioBtn.disabled = false;
    
    // Set initial button text based on track states
    toggleVideoBtn.textContent = "Mute Video";
    toggleAudioBtn.textContent = "Mute Audio";
    
  } catch (err) {
    console.error("Failed to join RTC channel:", err);
    alert("Failed to join RTC channel. Please check your connection and try again.");
  }
};

leaveMeetingBtn.addEventListener("click", async () => {
  if (!rtcClient) return;
  try {
    // Unpublish tracks
    if (localAudioTrack) {
      localAudioTrack.close();
    }
    if (localVideoTrack) {
      localVideoTrack.close();
    }
    
    // Clear remote videos
    remoteVideos.forEach((video) => {
      video.innerHTML = "";
    });
    remoteVideos.clear();
    
    // Leave channel
    await rtcClient.leave();
    
    // Reset UI
    logoutBtn.disabled = true;
    toggleVideoBtn.disabled = true;
    toggleAudioBtn.disabled = true;
    
    channelStatus.textContent = "Left RTC channel";
    addChatMessage(channelChatBox, "Left RTC channel");
  } catch (err) {
    console.error("Failed to leave RTC channel:", err);
  }
});

// Add event listeners for toggle buttons
toggleVideoBtn.addEventListener("click", async () => {
  if (!localVideoTrack) return;
  
  const enabled = !localVideoTrack.enabled;
  await localVideoTrack.setEnabled(enabled);
  toggleVideoBtn.textContent = enabled ? "Mute Video" : "Unmute Video";
  
  // If disabled, stop publishing the video track
  if (!enabled) {
    await rtcClient.unpublish([localVideoTrack]);
  } else {
    await rtcClient.publish([localVideoTrack]);
  }
});

toggleAudioBtn.addEventListener("click", async () => {
  if (!localAudioTrack) return;
  
  const enabled = !localAudioTrack.enabled;
  await localAudioTrack.setEnabled(enabled);
  toggleAudioBtn.textContent = enabled ? "Mute Audio" : "Unmute Audio";
  
  // If disabled, stop publishing the audio track
  if (!enabled) {
    await rtcClient.unpublish([localAudioTrack]);
  } else {
    await rtcClient.publish([localAudioTrack]);
  }
});

// Function to update video grid layout
function updateVideoGrid() {
  const additionalVideosContainer = document.getElementById("additionalVideos");
  const remoteVideoDiv = document.getElementById("remoteVideo");
  
  // Clear containers
  additionalVideosContainer.innerHTML = "";
  remoteVideoDiv.innerHTML = "";
  
  // Convert Map to Array for easier handling
  const remoteUsers = Array.from(remoteVideos.entries());
  
  // Handle first remote user (if any)
  if (remoteUsers.length > 0) {
    const [firstUserId, firstVideo] = remoteUsers[0];
    remoteVideoDiv.appendChild(firstVideo);
  }
  
  // Handle additional users (if any)
  for (let i = 1; i < remoteUsers.length; i++) {
    const [userId, video] = remoteUsers[i];
    additionalVideosContainer.appendChild(video);
  }
}
