// Initialize running line immediately
const runningLine = new Swiper("#him-running-line", {
  centeredSlides: false,
  slidesPerView: 'auto',
  freeMode: true,
  loop: true,
  spaceBetween: 10,
  autoplay: {
    delay: 0,
    disableOnInteraction: false,
  },
  speed: 2500,
});

// Function to initialize Swiper when element is visible
const initSwiperWhenVisible = (selector, options) => {
  const section = document.querySelector(selector);
  if (!section) return;

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        console.log(`Initializing Swiper for: ${selector}`);
        new Swiper(selector, options);
        observer.unobserve(entry.target); // Stop observing once initialized
      }
    });
  }, { rootMargin: "100px 0px" }); // Trigger a bit earlier to initialize

  observer.observe(section);
};

// Initialize Certificates Slider when visible
initSwiperWhenVisible(".him-certificates__slider", {
  centeredSlides: false,
  freeMode: false,
  mousewheel: false,
  slidesPerView: 5,
  spaceBetween: 10,
  navigation: {
    nextEl: '.certificate-next',
    prevEl: '.certificate-prev',
  },
  pagination: {
    el: ".him-certificates__pagination",
    clickable: true,
  },
  breakpoints: {
    0: {
      slidesPerView: 1
    },
    450: {
      slidesPerView: 2
    },
    650: {
      slidesPerView: 3
    },
    1050: {
      slidesPerView: 4
    },
    1250: {
      slidesPerView: 4
    },
    1450: {
      slidesPerView: 5
    },
    1650: {
      slidesPerView: 5
    }
  }
});

// Initialize Reviews Slider when visible
initSwiperWhenVisible(".him-reviews-slider", {
  centeredSlides: false,
  freeMode: false,
  mousewheel: false,
  slidesPerView: 1,
  spaceBetween: 60,
  navigation: {
    nextEl: '.review-next',
    prevEl: '.review-prev',
  },
  pagination: {
    el: ".review__pagination",
    clickable: true,
  },
});

// Initialize Written Reviews Slider when visible
initSwiperWhenVisible(".him-written-review-slider", {
  centeredSlides: false,
  freeMode: false,
  mousewheel: false,
  slidesPerView: 1,
  spaceBetween: 60,
  navigation: {
    nextEl: '.written-review-next',
    prevEl: '.written-review-prev',
  },
  pagination: {
    el: ".written-review__pagination",
    clickable: true,
  },
});


// --- Dynamic WaveSurfer Loading ---
let waveSurferScriptLoaded = false;
let waveSurferLoading = false;
const waveSurferScriptPath = document.querySelector('meta[name="theme-url"]').content + '/src/scripts/wavesurfer.js';
const activeWaveSurfers = []; // Keep track of all created instances

function loadWaveSurferScript(callback) {
    if (waveSurferScriptLoaded) {
        callback();
        return;
    }
    if (waveSurferLoading) {
        // If script is already loading, queue the callback
        document.addEventListener('wavesurferLoaded', callback, { once: true });
        return;
    }

    waveSurferLoading = true;
    console.log('Loading WaveSurfer script...');
    const script = document.createElement('script');
    script.src = waveSurferScriptPath;
    script.async = true;
    script.onload = () => {
        console.log('WaveSurfer script loaded.');
        waveSurferScriptLoaded = true;
        waveSurferLoading = false;
        // Dispatch event for any queued callbacks
        document.dispatchEvent(new CustomEvent('wavesurferLoaded'));
        callback(); // Execute the initial callback
    };
    script.onerror = () => {
        console.error('Failed to load WaveSurfer script.');
        waveSurferLoading = false;
    };
    document.body.appendChild(script);
    // Add the event listener for subsequent calls while loading
    document.addEventListener('wavesurferLoaded', callback, { once: true });
}

function initializeAndPlayWaveSurfer(playerElement) {
    const themeUrl = document.querySelector('meta[name="theme-url"]').content;
    const container = playerElement.querySelector('.waveform');
    const playBtn = playerElement.querySelector('.him-play-btn');
    const audioUrl = playerElement.dataset.audioUrl || '';

    if (!container || !playBtn || !audioUrl) {
        console.warn('Missing elements or audio URL for player:', playerElement);
        return;
    }

    // Check if instance already exists for this player
    if (playerElement.waveSurferInstance) {
        togglePlayPause(playerElement.waveSurferInstance, playBtn, themeUrl);
        return;
    }

    // Check if already initializing this specific player to prevent race conditions
    if (playerElement.dataset.wavesurferInitializing === 'true') {
        return;
    }
    playerElement.dataset.wavesurferInitializing = 'true';

    console.log('Initializing WaveSurfer for:', playerElement);
    const containerId = `waveform-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    container.id = containerId; // Ensure container has an ID

    try {
        const waveSurfer = WaveSurfer.create({
            container: `#${containerId}`,
            waveColor: '#BBBBBB',
            progressColor: '#18AB6B',
            cursorColor: 'transparent',
            responsive: true,
            height: 32,
            barWidth: 2,
            barGap: 3,
            barRadius: 3,
            normalize: true,
            backend: 'WebAudio'
        });

        waveSurfer.load(audioUrl);

        waveSurfer.on('ready', () => {
            console.log('WaveSurfer ready for:', audioUrl);
            playerElement.waveSurferInstance = waveSurfer; // Store instance
            activeWaveSurfers.push(waveSurfer); // Add to global list
            playerElement.dataset.wavesurferPlayerInitialized = 'true';
            delete playerElement.dataset.wavesurferInitializing; // Remove initializing flag
            togglePlayPause(waveSurfer, playBtn, themeUrl); // Play now that it's ready
        });

        waveSurfer.on('error', (err) => {
            console.warn(`Error loading audio: ${err}`);
            if (container) container.innerHTML = '<p class="text-danger" style="font-size: 12px;">Audio unavailable</p>';
            delete playerElement.dataset.wavesurferInitializing; // Remove initializing flag on error
        });

        waveSurfer.on('finish', () => {
            playBtn.innerHTML = `<img src="${themeUrl}/src/assets/icons/play.svg" alt="Play">`;
        });

    } catch (error) {
        console.error('WaveSurfer initialization error:', error);
        delete playerElement.dataset.wavesurferInitializing; // Remove initializing flag on catch
    }
}

function togglePlayPause(waveSurfer, playBtn, themeUrl) {
     // Pause all other active players
    activeWaveSurfers.forEach(ws => {
        if (ws !== waveSurfer && ws.isPlaying()) {
            ws.pause();
            // Find the corresponding button and update its icon
            const otherPlayer = document.querySelector(`[data-audio-url="${ws.backend.media.src}"]`); // Find player by URL
            if (otherPlayer) {
                 const otherBtn = otherPlayer.querySelector('.him-play-btn');
                 if(otherBtn) otherBtn.innerHTML = `<img src="${themeUrl}/src/assets/icons/play.svg" alt="Play">`;
            }
        }
    });

    // Toggle current player
    if (waveSurfer.isPlaying()) {
        waveSurfer.pause();
        playBtn.innerHTML = `<img src="${themeUrl}/src/assets/icons/play.svg" alt="Play">`;
    } else {
        waveSurfer.play();
        playBtn.innerHTML = `<img src="${themeUrl}/src/assets/icons/pause.svg" alt="Pause">`;
    }
}


// Function to prepare WaveSurfer buttons when section is visible
const prepareWaveSurferButtons = (selector) => {
  const section = document.querySelector(selector);
  if (!section) return;

  if (section.dataset.wavesurferButtonsPrepared === 'true') {
    return;
  }

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        console.log(`Preparing WaveSurfer buttons in: ${selector}`);
        const audioPlayers = section.querySelectorAll('.him-review__item');

        audioPlayers.forEach(player => {
          const playBtn = player.querySelector('.him-play-btn');
          if (playBtn && !player.dataset.wavesurferListenerAttached) { // Check if listener already attached
            playBtn.addEventListener('click', () => {
                // Load script if needed, then initialize and play
                loadWaveSurferScript(() => {
                    initializeAndPlayWaveSurfer(player);
                });
            });
            player.dataset.wavesurferListenerAttached = 'true'; // Mark listener as attached
          }
        });

        section.dataset.wavesurferButtonsPrepared = 'true';
        observer.unobserve(entry.target); // Stop observing once buttons are prepared
      }
    });
  }, { rootMargin: "100px 0px" }); // Trigger a bit earlier to attach listeners

  observer.observe(section);
};

// Prepare WaveSurfer buttons when the reviews section is visible
prepareWaveSurferButtons('#reviews');


// --- Keep existing logic below that doesn't need lazy init ---

// Certificate Modal Logic
document.addEventListener('DOMContentLoaded', function() {
  // Get WordPress theme directory URL from a meta tag that we'll need to add to header
  const themeUrl = document.querySelector('meta[name="theme-url"]').content;

  // Get modal elements
  const modal = document.getElementById('certificateModal');
  const modalImg = document.getElementById('certificateModalImg');
  const closeBtn = document.getElementsByClassName('modal-close')[0];
  
  // Add click handlers to certificate images
  document.querySelectorAll('.certificate-image').forEach(img => {
      img.addEventListener('click', function() {
          modal.style.display = "block";
          modalImg.src = this.getAttribute('data-full-image');
      });
  });
  
  // Close modal when clicking X
  closeBtn.addEventListener('click', () => {
      modal.style.display = "none";
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
      if (e.target === modal) {
          modal.style.display = "none";
      }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
      if (e.key === "Escape") {
          modal.style.display = "none";
      }
  });
});

// Exhibition Tabs Logic
const exhibitions = document.querySelectorAll('.him-exhibition__control-item');
exhibitions.forEach(item => {
  item.addEventListener('click', () => {
    const id = item.getAttribute('data-id');
    exhibitions.forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.him-exhibition__info').forEach(i => i.classList.remove('active'));
    document.getElementById(`exhibition-${id}`).classList.add('active')
    item.classList.add('active')
  })
});

// Scroll To Top Logic
const scrollToTopBtn = document.getElementById('scrollToTopBtn');

window.onscroll = function () {
  if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
    scrollToTopBtn.style.display = 'block';
  } else {
    scrollToTopBtn.style.display = 'none';
  }
};

scrollToTopBtn.addEventListener('click', function () {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});