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


const tracks = [
  { containerId: 'waveform1', buttonId: 'playBtn1', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform2', buttonId: 'playBtn2', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform3', buttonId: 'playBtn3', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform4', buttonId: 'playBtn4', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform5', buttonId: 'playBtn5', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform6', buttonId: 'playBtn6', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform7', buttonId: 'playBtn7', audio: 'src/assets/audios/audio.mp3' },
  { containerId: 'waveform8', buttonId: 'playBtn8', audio: 'src/assets/audios/audio.mp3' },
];

const waveSurfers = [];

tracks.forEach((track) => {
  const waveSurfer = WaveSurfer.create({
    container: `#${track.containerId}`,
    waveColor: '#BBBBBB',
    progressColor: '#18AB6B',
    cursorColor: 'transparent',
    responsive: true,
    height: 32,
  });

  waveSurfer.load(track.audio);

  const playBtn = document.getElementById(track.buttonId);
  playBtn.addEventListener('click', function () {
    if (waveSurfer.isPlaying()) {
      waveSurfer.pause();
      playBtn.innerHTML = '<img src="src/assets/icons/play.svg" alt="Play">';
    } else {
      waveSurfer.play();
      playBtn.innerHTML = '<img src="src/assets/icons/pause.svg" alt="Pause">';
    }
  });

  waveSurfers.push(waveSurfer);
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