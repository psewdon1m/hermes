// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // Extract room ID from URL
    const pathParts = window.location.pathname.split('/');
    const roomId = pathParts[pathParts.length - 1];
    
    if (!roomId || roomId === 'call') {
        // Invalid room ID, redirect to home
        window.location.href = '/';
        return;
    }
    
    // Initialize WebRTC manager
    const webrtcManager = new WebRTCManager();
    
    // Join the room
    webrtcManager.joinRoom(roomId);
    
    // Auto-copy link if coming from Telegram bot (check URL parameters)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auto_copy') === 'true') {
        setTimeout(() => {
            webrtcManager.copyLink();
        }, 1000);
    }
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Page hidden');
        } else {
            console.log('Page visible');
        }
    });
    
    // Handle beforeunload
    window.addEventListener('beforeunload', (event) => {
        webrtcManager.hangUp();
    });
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Space bar to toggle mute
        if (event.code === 'Space' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            webrtcManager.toggleAudio();
        }
        
        // V key to toggle video
        if (event.code === 'KeyV' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            webrtcManager.toggleVideo();
        }
        
        // S key to toggle screen share
        if (event.code === 'KeyS' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            webrtcManager.toggleScreenShare();
        }
        
        // Escape key to hang up
        if (event.code === 'Escape') {
            event.preventDefault();
            webrtcManager.hangUp();
        }
    });
    
    // Show keyboard shortcuts info
    setTimeout(() => {
        webrtcManager.showToast('Горячие клавиши: Пробел - микрофон, V - видео, S - экран, Esc - завершить', 'info');
    }, 2000);
});

