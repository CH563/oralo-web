(() => {
  const video = document.querySelector('#mirror-video');
  const button = document.querySelector('#mirror-play');
  const label = document.querySelector('#mirror-play-label');
  const error = document.querySelector('#mirror-video-error');
  if (!video || !button || !label) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mayAutoplay = () => !reducedMotion.matches && !navigator.connection?.saveData;
  let inViewport = false;
  let hasStarted = false;
  let resumeWhenVisible = false;

  const updateControl = () => {
    const key = video.paused ? 'mirrorPlay' : 'mirrorPause';
    label.dataset.i18n = key;
    label.textContent = t(key);
  };
  const loadSource = () => {
    if (!video.getAttribute('src')) video.src = video.dataset.source;
  };
  const play = () => {
    loadSource();
    video.play().catch(updateControl);
  };
  const updateVisibility = () => {
    if (!inViewport || document.hidden) {
      if (!video.paused) {
        resumeWhenVisible = true;
        video.pause();
      }
      return;
    }
    loadSource();
    if (mayAutoplay() && (!hasStarted || resumeWhenVisible)) {
      hasStarted = true;
      resumeWhenVisible = false;
      play();
    }
  };

  button.hidden = false;
  button.addEventListener('click', () => {
    hasStarted = true;
    resumeWhenVisible = false;
    if (video.paused) play();
    else video.pause();
  });
  video.addEventListener('play', () => {
    hasStarted = true;
    resumeWhenVisible = false;
    updateControl();
  });
  video.addEventListener('pause', updateControl);
  video.addEventListener('error', () => { error.hidden = false; });
  document.addEventListener('visibilitychange', updateVisibility);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      hasStarted = true;
      resumeWhenVisible = false;
      video.pause();
    } else updateVisibility();
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting && entry.intersectionRatio >= 0.2;
      updateVisibility();
    }, { threshold: [0, 0.2] });
    observer.observe(video);
  } else loadSource();
  updateControl();
})();
