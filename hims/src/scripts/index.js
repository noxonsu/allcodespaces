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

const certificates = new Swiper(".him-certificates__slider", {
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

const reviews = new Swiper(".him-reviews-slider", {
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

const writtenReviews = new Swiper(".him-written-review-slider", {
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

document.addEventListener('DOMContentLoaded', function() {
  // Audio player initialization
  const audioPlayers = document.querySelectorAll('.him-review__item');
  const waveSurfers = [];

  audioPlayers.forEach((player, index) => {
    const containerId = `waveform-${index}`;
    const buttonId = `playBtn-${index}`;
    const container = player.querySelector('.waveform');
    const playBtn = player.querySelector('.him-play-btn');
    
    if (container && playBtn) {
      // Set unique IDs
      container.id = containerId;
      playBtn.id = buttonId;
      
      // Get audio URL from data attribute
      const audioUrl = player.dataset.audioUrl || '';
      
      if (audioUrl) {
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

          // Load audio with error handling
          waveSurfer.load(audioUrl);
          
          // Handle loading errors
          waveSurfer.on('error', function(err) {
            console.warn(`Error loading audio: ${err}`);
            container.innerHTML = '<p class="text-danger">Audio unavailable</p>';
          });

          // Handle play/pause
          playBtn.addEventListener('click', function() {
            // Pause all other players
            waveSurfers.forEach(ws => {
              if (ws !== waveSurfer && ws.isPlaying()) {
                ws.pause();
                const btn = document.querySelector(`[data-wave-id="${ws.container.id}"]`);
                if (btn) {
                  btn.innerHTML = '<img src="src/assets/icons/play.svg" alt="Play">';
                }
              }
            });

            // Toggle current player
            if (waveSurfer.isPlaying()) {
              waveSurfer.pause();
              playBtn.innerHTML = '<img src="src/assets/icons/play.svg" alt="Play">';
            } else {
              waveSurfer.play();
              playBtn.innerHTML = '<img src="src/assets/icons/pause.svg" alt="Pause">';
            }
          });

          // Reset button on finish
          waveSurfer.on('finish', function() {
            playBtn.innerHTML = '<img src="src/assets/icons/play.svg" alt="Play">';
          });

          waveSurfers.push(waveSurfer);
        } catch (error) {
          console.error('WaveSurfer initialization error:', error);
        }
      }
    }
  });
});

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