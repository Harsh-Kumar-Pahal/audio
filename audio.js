// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDB_ylrW7hartjCjSAqjjZjUoNSrSX7Et4",
    authDomain: "blogs-a7325.firebaseapp.com",
    databaseURL: "https://blogs-a7325-default-rtdb.firebaseio.com",
    projectId: "blogs-a7325",
    storageBucket: "blogs-a7325.appspot.com",
    messagingSenderId: "868013133674",
    appId: "1:868013133674:web:8ceaa7dfa63ee0d2a0df13",
    measurementId: "G-RJX09FKMMY"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ]
};

let peerConnection;
let localStream;
let roomId;

// DOM elements
const createButton = document.getElementById('createButton');
const joinButton = document.getElementById('joinButton');
const hangupButton = document.getElementById('hangupButton');
const roomIdInput = document.getElementById('roomId');
const statusDiv = document.getElementById('status');
const errorDiv = document.getElementById('error');

// Event listeners
createButton.addEventListener('click', createRoom);
joinButton.addEventListener('click', joinRoom);
hangupButton.addEventListener('click', hangup);

async function createRoom() {
    try {
        roomId = roomIdInput.value || Math.random().toString(36).substring(7);
        roomIdInput.value = roomId;
        
        // Get local audio stream
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create peer connection
        peerConnection = new RTCPeerConnection(configuration);
        setupPeerConnection();
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Create and set local description
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Save the offer to Firebase
        await database.ref(`rooms/${roomId}/offer`).set({
            type: offer.type,
            sdp: offer.sdp
        });

        // Listen for the answer
        database.ref(`rooms/${roomId}/answer`).on('value', async snapshot => {
            const answer = snapshot.val();
            if (answer && !peerConnection.currentRemoteDescription) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        updateStatus('Room created! Waiting for someone to join...');
        updateButtons(true);

    } catch (error) {
        showError(`Error creating room: ${error.message}`);
    }
}

async function joinRoom() {
    try {
        roomId = roomIdInput.value;
        if (!roomId) {
            throw new Error('Please enter a room ID');
        }

        // Get local audio stream
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create peer connection
        peerConnection = new RTCPeerConnection(configuration);
        setupPeerConnection();
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Get the offer from Firebase
        const snapshot = await database.ref(`rooms/${roomId}/offer`).get();
        const offer = snapshot.val();
        if (!offer) {
            throw new Error('Room not found');
        }

        // Set remote description (offer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Create and set local description (answer)
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Save the answer to Firebase
        await database.ref(`rooms/${roomId}/answer`).set({
            type: answer.type,
            sdp: answer.sdp
        });

        updateStatus('Joined room! Connected to peer.');
        updateButtons(true);

    } catch (error) {
        showError(`Error joining room: ${error.message}`);
    }
}

function setupPeerConnection() {
    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            database.ref(`rooms/${roomId}/candidates`).push({
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
            });
        }
    };

    // Listen for remote ICE candidates
    database.ref(`rooms/${roomId}/candidates`).on('child_added', snapshot => {
        const candidate = snapshot.val();
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // Handle remote stream
    peerConnection.ontrack = event => {
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play();
        updateStatus('Connected! Audio streaming...');
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected') {
            hangup();
        }
    };
}

function hangup() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (roomId) {
        database.ref(`rooms/${roomId}`).remove();
        roomId = null;
    }

    updateStatus('Call ended');
    updateButtons(false);
    roomIdInput.value = '';
}

function updateButtons(inCall) {
    createButton.disabled = inCall;
    joinButton.disabled = inCall;
    hangupButton.disabled = !inCall;
    roomIdInput.disabled = inCall;
}

function updateStatus(message) {
    statusDiv.textContent = message;
    errorDiv.style.display = 'none';
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    hangup();
}

// Clean up when the page is closed
window.addEventListener('beforeunload', hangup);