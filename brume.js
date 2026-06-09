(function() {
  "use strict";

  const PRELOADER_FRAME_COUNT = 30;
  const FRAME_TARGET = 80;
  const PRELOADER_DURATION = 3000;
  const PRELOADER_MOBILE_DURATION = 2000;
  const PRELOADER_FRAME_TIME = PRELOADER_DURATION / PRELOADER_FRAME_COUNT;
  const GH_RAW = "https://raw.githubusercontent.com/artKorolev99/brume/main/";
  const LOGO_URL = "https://raw.githubusercontent.com/artKorolev99/brume/d0d501af6b7143a224b1c25bffc8527c7b9db6a0/preloader/logo/logo-brume.png";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const el = {
    preloader: document.getElementById("preloader"),
    preloaderCanvas: document.getElementById("preloaderCanvas"),
    preloaderFallback: document.getElementById("preloaderFallback"),
    preloaderProgress: document.getElementById("preloaderProgress"),
    preloaderCounter: document.getElementById("preloaderCounter"),
    site: document.getElementById("site"),
    siteHeader: document.getElementById("siteHeader"),
    mobileNav: document.getElementById("mobileNav"),
    burger: document.getElementById("burger"),
  };

  let lenis = null;
  const sequences = [];

  function padFrame(n) {
    return String(n).padStart(3, "0");
  }

  function getScrollY() {
    if (lenis && typeof lenis.scroll === "number") return lenis.scroll;
    return window.scrollY || document.documentElement.scrollTop;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function mapRange(v, inMin, inMax, outMin, outMax) {
    const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
    return outMin + (outMax - outMin) * t;
  }

  function loadImage(src) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.decoding = "async";
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error(src)); };
      img.src = src;
    });
  }

  function resizeCanvas(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { w: w, h: h };
  }

  function drawCover(ctx, img, w, h) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return false;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return true;
  }

  function getSequenceProgress(sequenceEl) {
    const scrollY = getScrollY();
    const start = scrollY + sequenceEl.getBoundingClientRect().top;
    const scrollable = sequenceEl.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return clamp((scrollY - start) / scrollable, 0, 1);
  }

  function progressToFrame(progress, maxFrame) {
    if (maxFrame <= 1) return 1;
    return 1 + Math.round(progress * (maxFrame - 1));
  }

  function textKeyframe(frameOn80, maxFrame) {
    return Math.max(1, Math.min(maxFrame, Math.round((frameOn80 * maxFrame) / FRAME_TARGET)));
  }

  function isMobileScene() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function isSceneInView(el, minRatio) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight;
    var visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    var den = Math.min(rect.height, vh);
    if (den <= 0) return false;
    return visible / den >= (minRatio || 0.25);
  }

  function createSequence(config) {
    const state = {
      cache: new Map(),
      maxFrame: FRAME_TARGET,
      lastFrame: 0,
      lastSource: 0,
      ticking: false,
    };
    const mobileAuto = isMobileScene() && config.textHoldAt80;
    const auto = {
      playing: false,
      introDone: false,
      targetFrame: 1,
      raf: null,
    };

    function syncMaxFrame() {
      let max = 0;
      for (let i = 1; i <= FRAME_TARGET; i += 1) {
        if (state.cache.has(i)) max = i;
        else break;
      }
      if (max > 0) state.maxFrame = max;
    }

    function url(frame) {
      return GH_RAW + config.folder + "/" + padFrame(frame) + ".jpg";
    }

    function resolveSource(requested) {
      if (state.cache.has(requested)) return requested;
      for (let f = requested - 1; f >= 1; f -= 1) {
        if (state.cache.has(f)) return f;
      }
      return 0;
    }

    function draw(frame) {
      const source = resolveSource(frame);
      if (!source) return;
      if (frame === state.lastFrame && source === state.lastSource) return;

      const img = state.cache.get(source);
      state.lastFrame = frame;
      state.lastSource = source;

      const size = resizeCanvas(config.canvas, config.ctx);
      config.ctx.fillStyle = "#0a0a0c";
      config.ctx.fillRect(0, 0, size.w, size.h);
      if (drawCover(config.ctx, img, size.w, size.h)) {
        config.fallback.classList.add("is-hidden");
      }
    }

    function updateText(frame) {
      if (!config.textEl || !config.textTiming) return;
      config.textTiming(frame, state.maxFrame, config.textEl);
    }

    function applyTextHold() {
      if (!config.textEl) return;
      config.textEl.style.opacity = "1";
      config.textEl.style.transform = "translate(-50%, -50%)";
    }

    function getAutoTargetFrame() {
      return Math.max(1, textKeyframe(config.textHoldAt80, state.maxFrame));
    }

    function startAutoPlay() {
      if (!mobileAuto || auto.playing || auto.introDone) return;
      auto.targetFrame = getAutoTargetFrame();
      if (state.maxFrame < 1) return;

      auto.playing = true;
      var duration = config.autoDuration || 3000;
      var start = performance.now();

      function step(now) {
        var t = clamp((now - start) / duration, 0, 1);
        var frame = progressToFrame(t, auto.targetFrame);
        draw(frame);
        updateText(frame);

        if (t < 1) {
          auto.raf = requestAnimationFrame(step);
        } else {
          auto.playing = false;
          auto.introDone = true;
          draw(auto.targetFrame);
          updateText(auto.targetFrame);
          requestRender();
        }
      }

      if (auto.raf) cancelAnimationFrame(auto.raf);
      auto.raf = requestAnimationFrame(step);
    }

    function render() {
      state.ticking = false;
      resizeCanvas(config.canvas, config.ctx);

      if (reduceMotion) {
        draw(1);
        applyTextHold();
        return;
      }

      if (mobileAuto) {
        if (config.scrollCue) config.scrollCue.classList.add("is-hidden");
        if (auto.playing) return;

        if (!auto.introDone) {
          draw(1);
          updateText(1);
          return;
        }

        var scrollProgress = getSequenceProgress(config.sequenceEl);
        var holdFrame = auto.targetFrame;
        var maxF = state.maxFrame;
        var mobileFrame = maxF <= holdFrame
          ? holdFrame
          : Math.round(holdFrame + scrollProgress * (maxF - holdFrame));
        draw(mobileFrame);
        updateText(mobileFrame);
        return;
      }

      const progress = getSequenceProgress(config.sequenceEl);
      const frame = progressToFrame(progress, state.maxFrame);
      draw(frame);
      updateText(frame);
      if (config.scrollCue) {
        var cue = config.scrollCue;
        var hideAt = textKeyframe(10, state.maxFrame);
        var fadeFrom = Math.max(1, hideAt - 2);
        var fadeTo = Math.min(state.maxFrame, hideAt + 3);

        if (progress <= 0.001) {
          cue.classList.remove("is-hidden");
          cue.style.opacity = "";
        } else if (frame >= fadeTo) {
          cue.classList.add("is-hidden");
          cue.style.opacity = "0";
        } else if (frame >= fadeFrom) {
          cue.classList.remove("is-hidden");
          cue.style.opacity = String(mapRange(frame, fadeFrom, fadeTo, 1, 0));
        } else {
          cue.classList.remove("is-hidden");
          cue.style.opacity = "1";
        }
      }
    }

    function requestRender() {
      if (state.ticking) return;
      state.ticking = true;
      requestAnimationFrame(render);
    }

    function preload() {
      const jobs = [];
      for (let i = 1; i <= FRAME_TARGET; i += 1) {
        const frame = i;
        jobs.push(
          loadImage(url(frame))
            .then(function(img) {
              state.cache.set(frame, img);
              syncMaxFrame();
              requestRender();
              return { frame: frame, ok: true };
            })
            .catch(function() {
              return { frame: frame, ok: false };
            })
        );
      }
      return Promise.all(jobs).then(function(results) {
        syncMaxFrame();
        const failed = results.filter(function(r) { return !r.ok; });
        if (failed.length && config.name) {
          console.warn("[Brume] " + config.name + ": загружено", state.maxFrame, "из", FRAME_TARGET);
        }
        requestRender();
        return results;
      });
    }

    return {
      state: state,
      preload: preload,
      requestRender: requestRender,
      render: render,
      url: url,
      syncMaxFrame: syncMaxFrame,
      startAutoPlay: startAutoPlay,
      isIntroDone: function() { return auto.introDone; },
      isAutoPlaying: function() { return auto.playing; },
      sequenceEl: config.sequenceEl,
    };
  }

  function initMobileSceneAutoplay(sceneList) {
    if (!isMobileScene()) return;

    sceneList.forEach(function(item) {
      function tryStart() {
        if (!item.seq || item.seq.isIntroDone() || item.seq.isAutoPlaying()) return;
        var need = textKeyframe(item.holdAt80, item.seq.state.maxFrame);
        if (item.seq.state.maxFrame < Math.min(need, 8)) return;
        if (!isSceneInView(item.el, 0.25)) return;
        item.seq.startAutoPlay();
      }

      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) tryStart();
        });
      }, { threshold: [0, 0.25, 0.4], rootMargin: "0px 0px -5% 0px" });

      obs.observe(item.el);

      if (isSceneInView(item.el, 0.25)) tryStart();
    });

    var attempts = 0;
    var poll = setInterval(function() {
      attempts += 1;
      sceneList.forEach(function(item) {
        if (!item.seq || item.seq.isIntroDone() || item.seq.isAutoPlaying()) return;
        var need = textKeyframe(item.holdAt80, item.seq.state.maxFrame);
        if (item.seq.state.maxFrame < Math.min(need, 8)) return;
        if (isSceneInView(item.el, 0.25)) item.seq.startAutoPlay();
      });
      if (attempts > 40) clearInterval(poll);
    }, 250);
  }

  /* Scene 1 — текущая логика (кастом пользователя) */
  function scene1Text(frame, maxFrame, textEl) {
    var opacity = 0;
    var translateY = 60;
    var textIn = textKeyframe(56, maxFrame);
    var textHold = textKeyframe(60, maxFrame);
    var textHoldEnd = textKeyframe(78, maxFrame);
    var textOutStart = textKeyframe(79, maxFrame);
    var textOutEnd = Math.min(textKeyframe(80, maxFrame), maxFrame);

    if (frame >= textIn && frame < textHold) {
      opacity = mapRange(frame, textIn, textHold, 0, 1);
      translateY = mapRange(frame, textIn, textHold, 60, 0);
    } else if (frame >= textHold && frame <= textHoldEnd) {
      opacity = 1;
      translateY = 0;
    } else if (frame >= textOutStart && frame <= textOutEnd) {
      if (textOutEnd > textOutStart) {
        opacity = mapRange(frame, textOutStart, textOutEnd, 1, 0);
        translateY = mapRange(frame, textOutStart, textOutEnd, 0, -30);
      } else {
        opacity = 0;
        translateY = -30;
      }
    }

    textEl.style.opacity = String(opacity);
    textEl.style.transform = "translate(-50%, calc(-50% + " + translateY + "px))";
  }

  /* Scene 2 — по BRUME_SPEC */
  function scene2Text(frame, maxFrame, textEl) {
    var opacity = 0;
    var translateY = 60;
    var textIn = textKeyframe(33, maxFrame);
    var textHold = textKeyframe(36, maxFrame);
    var textHoldEnd = textKeyframe(69, maxFrame);
    var textOutStart = textKeyframe(70, maxFrame);
    var textOutEnd = Math.min(textKeyframe(73, maxFrame), maxFrame);

    if (frame >= textIn && frame < textHold) {
      opacity = mapRange(frame, textIn, textHold, 0, 1);
      translateY = mapRange(frame, textIn, textHold, 60, 0);
    } else if (frame >= textHold && frame <= textHoldEnd) {
      opacity = 1;
      translateY = 0;
    } else if (frame >= textOutStart && frame <= textOutEnd) {
      if (textOutEnd > textOutStart) {
        opacity = mapRange(frame, textOutStart, textOutEnd, 1, 0);
        translateY = mapRange(frame, textOutStart, textOutEnd, 0, -30);
      } else {
        opacity = 0;
        translateY = -30;
      }
    }

    textEl.style.opacity = String(opacity);
    textEl.style.transform = "translate(-50%, calc(-50% + " + translateY + "px))";
  }

  /* Preloader */
  const preloaderCache = new Map();
  const preloaderDrawState = { lastFrame: 0 };
  let lastPreloaderFrame = 0;
  const preloaderCtx = el.preloaderCanvas ? el.preloaderCanvas.getContext("2d", { alpha: false }) : null;

  function drawPreloaderToCanvas(canvas, ctx, frame, drawState) {
    if (!canvas || !ctx || frame === drawState.lastFrame) return false;
    const img = preloaderCache.get(frame);
    if (!img) return false;
    drawState.lastFrame = frame;
    const size = resizeCanvas(canvas, ctx);
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, size.w, size.h);
    drawCover(ctx, img, size.w, size.h);
    return true;
  }

  function setPreloaderPercent(percent) {
    var pct = Math.min(100, Math.max(0, Math.round(percent)));
    if (el.preloaderCounter) el.preloaderCounter.textContent = "Загрузка " + pct + "%";
    if (el.preloaderProgress) el.preloaderProgress.style.width = pct + "%";
  }

  function drawPreloaderFrame(frame) {
    if (frame === lastPreloaderFrame || !el.preloaderCanvas || !preloaderCtx) return;
    if (drawPreloaderToCanvas(el.preloaderCanvas, preloaderCtx, frame, preloaderDrawState)) {
      el.preloaderFallback.classList.add("is-hidden");
    }
    lastPreloaderFrame = frame;
    var loadBase = 45;
    var playPart = ((frame / PRELOADER_FRAME_COUNT) * (100 - loadBase));
    setPreloaderPercent(loadBase + playPart);
  }

  function revealSite() {
    el.site.classList.remove("is-hidden");
    requestAnimationFrame(function() {
      el.site.classList.add("is-visible");
      if (el.siteHeader) el.siteHeader.classList.add("is-visible");
    });
  }

  function finishPreloader() {
    revealSite();
    playMobileHeroVideo();
    el.preloader.classList.add("is-complete");
    setTimeout(function() { el.preloader.remove(); }, 700);
  }

  function runPreloader() {
    if (!preloaderCache.has(1)) {
      setPreloaderPercent(0);
      setTimeout(runPreloader, 120);
      return;
    }
    if (reduceMotion) {
      drawPreloaderFrame(PRELOADER_FRAME_COUNT);
      setPreloaderPercent(100);
      setTimeout(finishPreloader, 900);
      return;
    }
    const start = performance.now();
    const duration = isMobileScene() ? PRELOADER_MOBILE_DURATION : PRELOADER_DURATION;
    const frameTime = duration / PRELOADER_FRAME_COUNT;
    el.preloader.classList.add("is-playing");
    resizeCanvas(el.preloaderCanvas, preloaderCtx);
    drawPreloaderFrame(1);
    function tick(now) {
      const elapsed = Math.min(now - start, duration);
      const frame = Math.min(PRELOADER_FRAME_COUNT, Math.max(1, Math.floor(elapsed / frameTime) + 1));
      drawPreloaderFrame(frame);
      if (elapsed < duration) requestAnimationFrame(tick);
      else finishPreloader();
    }
    requestAnimationFrame(tick);
  }

  function preloadPreloader() {
    const jobs = [];
    for (let i = 1; i <= PRELOADER_FRAME_COUNT; i += 1) {
      const src = GH_RAW + "preloader/" + padFrame(i) + ".jpg";
      jobs.push(loadImage(src).then(function(img) {
        preloaderCache.set(i, img);
        setPreloaderPercent((preloaderCache.size / PRELOADER_FRAME_COUNT) * 45);
        return true;
      }).catch(function() { return false; }));
    }
    return Promise.all(jobs);
  }

  function initLenis() {
    if (reduceMotion || typeof Lenis === "undefined" || isMobileScene()) return;
    lenis = new Lenis({
      duration: 1.8,
      easing: function(t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
    });
    lenis.on("scroll", function() {
      sequences.forEach(function(s) { s.requestRender(); });
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
      updateHeader();
    });
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  function updateHeader() {
    if (!el.siteHeader) return;
    el.siteHeader.classList.toggle("is-scrolled", getScrollY() > 100);
  }

  function scrollToSection(target) {
    if (!target) return;
    var offset = -(parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-offset"), 10) || 92);

    if (target.id === "heroSequence" && isMobileScene()) {
      var mobileHero = document.getElementById("mobileHero");
      if (mobileHero) target = mobileHero;
    }

    var menuRail = document.getElementById("menuRail");
    var menuTrack = document.querySelector(".menu-rail__track");
    var menuViewport = document.querySelector(".menu-rail__viewport");
    var isMenuCardTarget = menuRail && menuTrack && target.classList && target.classList.contains("menu-block") && menuRail.contains(target);

    if (isMenuCardTarget) {
      var railTop = menuRail.getBoundingClientRect().top + window.scrollY;

      if (menuRail.classList.contains("menu-rail--carousel") && menuViewport) {
        if (lenis && typeof lenis.scrollTo === "function") {
          lenis.scrollTo(menuRail, { offset: offset });
        } else {
          var mobileTop = railTop + offset;
          window.scrollTo({ top: mobileTop, behavior: "smooth" });
        }

        setTimeout(function() {
          var trackPadLeft = parseFloat(getComputedStyle(menuTrack).paddingLeft) || 0;
          var x = Math.max(0, target.offsetLeft - trackPadLeft);
          menuViewport.scrollTo({ left: x, behavior: "smooth" });
        }, 260);
        return;
      }

      var scrollDistance = Math.max(1, menuTrack.scrollWidth - window.innerWidth);
      var padLeft = parseFloat(getComputedStyle(menuTrack).paddingLeft) || 0;
      var cardShift = Math.max(0, target.offsetLeft - padLeft);
      var progress = clamp(cardShift / scrollDistance, 0, 1);
      var desktopTop = railTop + progress * scrollDistance + offset;

      if (lenis && typeof lenis.scrollTo === "function") {
        lenis.scrollTo(desktopTop);
      } else {
        window.scrollTo({ top: desktopTop, behavior: "smooth" });
      }
      return;
    }

    if (lenis && typeof lenis.scrollTo === "function") {
      lenis.scrollTo(target, { offset: offset });
      return;
    }
    var top = target.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top: top, behavior: "smooth" });
  }

  function initHeader() {
    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
      link.addEventListener("click", function(e) {
        var hash = link.getAttribute("href");
        if (!hash || hash === "#") return;
        var target = document.querySelector(hash);
        if (!target) return;
        e.preventDefault();
        scrollToSection(target);
        if (el.mobileNav) el.mobileNav.classList.remove("is-open");
        if (el.burger) el.burger.setAttribute("aria-expanded", "false");
      });
    });

    if (!el.burger || !el.mobileNav) return;
    el.burger.addEventListener("click", function() {
      const open = el.mobileNav.classList.toggle("is-open");
      el.burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    el.mobileNav.querySelectorAll("a").forEach(function(link) {
      link.addEventListener("click", function() {
        el.mobileNav.classList.remove("is-open");
        el.burger.setAttribute("aria-expanded", "false");
      });
    });
    window.addEventListener("scroll", updateHeader, { passive: true });

    var sections = document.querySelectorAll("[data-section]");
    var navLinks = document.querySelectorAll("[data-nav]");
    if ("IntersectionObserver" in window && navLinks.length) {
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            navLinks.forEach(function(a) {
              a.classList.toggle("is-active", a.getAttribute("href") === "#" + id);
            });
          }
        });
      }, { rootMargin: "-40% 0px -50% 0px" });
      sections.forEach(function(s) { obs.observe(s); });
    }
  }

  function gallerySrc(index) {
    return GH_RAW + "gallery/gallery" + (index + 1) + ".jpg";
  }

  function initLazyMenuBackgrounds() {
    var blocks = Array.from(document.querySelectorAll(".menu-block[style], .menu-block[class*='menu-block--bg-'], .menu-block--art-hookah"))
      .filter(function(block) { return getComputedStyle(block).getPropertyValue("--menu-bg-image").trim(); });

    if (!blocks.length) return;

    function loadBlock(block) {
      block.classList.add("is-bg-loaded");
    }

    if (!("IntersectionObserver" in window)) {
      blocks.forEach(loadBlock);
      return;
    }

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        loadBlock(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "700px 700px", threshold: 0.01 });

    blocks.forEach(function(block) { observer.observe(block); });
  }

  const LIGHTBOX_BG = GH_RAW + "preloader/" + padFrame(PRELOADER_FRAME_COUNT) + ".jpg";

  function initGallery() {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightboxImg");
    var lightboxPanel = lightbox && lightbox.querySelector(".lightbox__panel");
    var lightboxOverlayCanvas = document.getElementById("lightboxOverlayCanvas");
    var lightboxOverlayCtx = lightboxOverlayCanvas
      ? lightboxOverlayCanvas.getContext("2d", { alpha: false })
      : null;
    if (!lightbox || !lightboxImg || !lightboxPanel) return;

    var items = Array.from(document.querySelectorAll(".gallery-bento__item"));
    var sources = items.map(function(_, i) { return gallerySrc(i); });
    var current = 0;
    var lightboxOverlayState = { lastFrame: 0 };

    function drawLightboxOverlay() {
      if (!lightboxOverlayCanvas || !lightboxOverlayCtx) return;

      function paint(img) {
        lightboxOverlayState.lastFrame = 0;
        drawPreloaderToCanvas(
          lightboxOverlayCanvas,
          lightboxOverlayCtx,
          PRELOADER_FRAME_COUNT,
          lightboxOverlayState
        );
      }

      var cached = preloaderCache.get(PRELOADER_FRAME_COUNT);
      if (cached) {
        paint(cached);
        return;
      }

      loadImage(LIGHTBOX_BG).then(function(img) {
        preloaderCache.set(PRELOADER_FRAME_COUNT, img);
        if (lightbox.classList.contains("is-open")) paint(img);
      }).catch(function() {});
    }

    function showLightboxImage(i) {
      var src = sources[i] || "";
      lightboxImg.onload = function() {
        lightboxImg.style.opacity = "1";
      };
      lightboxImg.style.opacity = src ? "0.001" : "0";
      lightboxImg.src = src;
      lightboxImg.alt = items[i] ? (items[i].getAttribute("aria-label") || "") : "";
      if (lightboxImg.complete && lightboxImg.naturalWidth) {
        lightboxImg.style.opacity = "1";
      }
    }

    function loadGalleryItem(btn, i) {
      if (btn.dataset.loaded === "true") return;
      var src = sources[i];
      if (!src) return;
      btn.dataset.loaded = "true";
      var img = new Image();
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = btn.getAttribute("aria-label") || "";
      btn.replaceChildren(img);
      img.src = src;
    }

    items.forEach(loadGalleryItem);

    function open(i) {
      loadGalleryItem(items[i], i);
      current = i;
      showLightboxImage(i);
      document.body.classList.add("is-lightbox-open");
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (lenis && typeof lenis.stop === "function") lenis.stop();
      drawLightboxOverlay();
    }

    function close() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-lightbox-open");
      document.body.style.overflow = "";
      if (lenis && typeof lenis.start === "function") lenis.start();
    }

    function step(dir) {
      current = (current + dir + items.length) % items.length;
      showLightboxImage(current);
    }

    items.forEach(function(btn, i) {
      btn.addEventListener("click", function() { open(i); });
    });
    lightbox.querySelector("[data-lightbox-close]").addEventListener("click", close);
    lightboxImg.addEventListener("click", close);
    lightbox.querySelector("[data-lightbox-prev]").addEventListener("click", function(e) { e.stopPropagation(); step(-1); });
    lightbox.querySelector("[data-lightbox-next]").addEventListener("click", function(e) { e.stopPropagation(); step(1); });
    document.addEventListener("keydown", function(e) {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
    window.addEventListener("resize", function() {
      if (lightbox.classList.contains("is-open")) drawLightboxOverlay();
    });
  }

  function initReviewTextToggle() {
    var limit = 120;

    document.querySelectorAll(".review-card").forEach(function(card) {
      var textEl = card.querySelector(".review-card__text");
      if (!textEl) return;

      var full = textEl.textContent.trim();
      if (full.length <= limit) return;

      var short = full.slice(0, limit);
      var lastSpace = short.lastIndexOf(" ");
      if (lastSpace > limit * 0.55) short = short.slice(0, lastSpace);
      short = short.trim() + "…";

      textEl.textContent = short;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "review-card__more";
      btn.textContent = "Читать далее";
      btn.setAttribute("aria-expanded", "false");

      btn.addEventListener("click", function() {
        var expanded = btn.getAttribute("aria-expanded") === "true";
        if (expanded) {
          textEl.textContent = short;
          btn.textContent = "Читать далее";
          btn.setAttribute("aria-expanded", "false");
          card.classList.remove("is-expanded");
        } else {
          textEl.textContent = full;
          btn.textContent = "Свернуть";
          btn.setAttribute("aria-expanded", "true");
          card.classList.add("is-expanded");
        }
      });

      card.appendChild(btn);
    });
  }

  function initReviews() {
    var track = document.getElementById("reviewsTrack");
    if (!track) return;

    var cards = Array.from(track.children);
    var index = 0;

    function cardStep() {
      var card = cards[0];
      if (!card) return 0;
      return card.offsetWidth + 24;
    }

    function maxIndex() {
      var viewport = track.parentElement;
      if (!viewport) return Math.max(0, cards.length - 1);
      var visible = Math.max(1, Math.floor(viewport.offsetWidth / cardStep()));
      return Math.max(0, cards.length - visible);
    }

    function render() {
      var step = cardStep();
      track.style.transform = "translateX(" + (-index * step) + "px)";
    }

    document.querySelector("[data-reviews-prev]")?.addEventListener("click", function() {
      index = Math.max(0, index - 1);
      render();
    });
    document.querySelector("[data-reviews-next]")?.addEventListener("click", function() {
      index = Math.min(maxIndex(), index + 1);
      render();
    });
    window.addEventListener("resize", function() {
      index = Math.min(index, maxIndex());
      render();
    }, { passive: true });
    initReviewTextToggle();
    render();
  }

  function initFaq() {
    document.querySelectorAll(".faq__question").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var item = btn.closest(".faq__item");
        var open = item.classList.contains("is-open");
        document.querySelectorAll(".faq__item.is-open").forEach(function(i) {
          i.classList.remove("is-open");
          i.querySelector(".faq__question").setAttribute("aria-expanded", "false");
        });
        if (!open) {
          item.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  function initDrinkTabs() {
    document.querySelectorAll(".menu-block--drinks").forEach(function(card) {
      var tabs = Array.from(card.querySelectorAll("[data-drink-tab]"));
      var panels = Array.from(card.querySelectorAll(".drink-panel"));
      tabs.forEach(function(tab) {
        tab.addEventListener("click", function() {
          var id = tab.getAttribute("data-drink-tab");
          tabs.forEach(function(t) { t.classList.toggle("is-active", t === tab); });
          panels.forEach(function(panel) { panel.classList.toggle("is-active", panel.id === id); });
        });
      });
    });
  }

  function playMobileHeroVideo() {
    if (!isMobileScene()) return;
    var video = document.getElementById("mobileHeroVideo");
    if (!video) return;
    video.play().catch(function() {});
  }

  function initBooking() {
    var form = document.getElementById("bookingForm");
    if (!form) return;
    var success = document.getElementById("bookingSuccess");
    var phone = form.querySelector('[name="phone"]');
    var datetime = form.querySelector('[name="datetime"]');

    if (phone) {
      phone.addEventListener("input", function(e) {
        var x = e.target.value.replace(/\D/g, "").match(/(\d{0,1})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})/);
        if (!x[2] && x[1] !== "") {
          e.target.value = x[1] === "8" ? "+7" : "+" + x[1];
        } else {
          e.target.value = !x[2] ? x[1] : "+7 (" + x[2] + (x[3] ? ") " + x[3] : "") + (x[4] ? "-" + x[4] : "") + (x[5] ? "-" + x[5] : "");
        }
      });
    }
    if (datetime) {
      datetime.addEventListener("focus", function() { this.style.colorScheme = "dark"; });
    }

    form.addEventListener("submit", async function(e) {
      e.preventDefault();
      var valid = true;
      form.querySelectorAll("[required]").forEach(function(input) {
        var err = input.parentElement.querySelector(".field-error");
        if (!input.value.trim()) {
          valid = false;
          input.classList.add("is-error");
          if (err) err.textContent = "Заполните поле";
        } else {
          input.classList.remove("is-error");
          if (err) err.textContent = "";
        }
      });
      if (phone && phone.value.replace(/\D/g, "").length < 11) {
        valid = false;
        phone.classList.add("is-error");
        phone.parentElement.querySelector(".field-error").textContent = "Введите корректный телефон";
      }
      if (!valid) return;

      var btn = form.querySelector(".gold-btn");
      btn.textContent = "Отправляем…";
      btn.style.opacity = "0.65";
      btn.style.pointerEvents = "none";

      try {
        var response = await fetch("https://art-korolev.ru/brume-new/booking.php", {
          method: "POST",
          body: new FormData(form),
          headers: { "Accept": "application/json" },
        });
        var result = await response.json().catch(function() { return {}; });
        if (!response.ok || !result.ok) {
          throw new Error(result.message || "send_failed");
        }

        form.style.display = "none";
        success.classList.add("is-visible");
      } catch (err) {
        var formError = form.querySelector(".form-error");
        if (!formError) {
          formError = document.createElement("p");
          formError.className = "field-error form-error";
          formError.setAttribute("aria-live", "polite");
          form.appendChild(formError);
        }
        formError.textContent = "Не удалось отправить заявку. Позвоните нам: +7 (903) 363-76-10";
      } finally {
        btn.textContent = "Забронировать столик";
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
      }
    });
  }

  function initFaqCanvas() {
    var canvas = document.getElementById("faqCanvas");
    var faqSection = document.querySelector(".faq-section");
    if (!canvas || !faqSection) return;

    var ctx = canvas.getContext("2d", { alpha: false });
    var drawState = { lastFrame: 0 };
    var animRaf = null;
    var playStart = 0;
    var isPlaying = false;
    var isVisible = false;
    var currentFrame = 1;

    function drawFaqFrame(frame) {
      currentFrame = frame;
      drawState.lastFrame = 0;
      if (preloaderCache.has(frame)) {
        drawPreloaderToCanvas(canvas, ctx, frame, drawState);
        return;
      }
      var size = resizeCanvas(canvas, ctx);
      ctx.fillStyle = "#0a0805";
      ctx.fillRect(0, 0, size.w, size.h);
    }

    function stopFaqAnimation() {
      if (animRaf) cancelAnimationFrame(animRaf);
      animRaf = null;
      isPlaying = false;
    }

    function playFaqOnce() {
      stopFaqAnimation();

      if (reduceMotion) {
        drawFaqFrame(PRELOADER_FRAME_COUNT);
        return;
      }

      if (!preloaderCache.has(1)) {
        setTimeout(playFaqOnce, 120);
        return;
      }

      isPlaying = true;
      playStart = performance.now();
      drawFaqFrame(1);

      function tick(now) {
        if (!isVisible) {
          stopFaqAnimation();
          return;
        }
        var elapsed = Math.min(now - playStart, PRELOADER_DURATION);
        var frame = Math.min(
          PRELOADER_FRAME_COUNT,
          Math.max(1, Math.floor(elapsed / PRELOADER_FRAME_TIME) + 1)
        );
        drawFaqFrame(frame);
        if (elapsed < PRELOADER_DURATION) {
          animRaf = requestAnimationFrame(tick);
        } else {
          stopFaqAnimation();
        }
      }

      animRaf = requestAnimationFrame(tick);
    }

    if ("IntersectionObserver" in window) {
      var faqObs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            isVisible = true;
            playFaqOnce();
          } else {
            isVisible = false;
            stopFaqAnimation();
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

      faqObs.observe(faqSection);
    } else {
      playFaqOnce();
    }

    window.addEventListener("resize", function() {
      if (isVisible || currentFrame > 1) drawFaqFrame(currentFrame);
    }, { passive: true });
  }

  function isMobileMenu() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function initMenuRail() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    var menuTrack = document.querySelector(".menu-rail__track");
    var rail = document.getElementById("menuRail");
    var viewport = document.querySelector(".menu-rail__viewport");
    var swipeHint = document.getElementById("menuSwipeHint");
    if (!menuTrack || !rail) return;

    var menuRailTween = null;

    function getMenuScrollDistance() {
      return Math.max(0, menuTrack.scrollWidth - window.innerWidth);
    }

    function destroyMenuRailScroll() {
      if (menuRailTween) {
        if (menuRailTween.scrollTrigger) menuRailTween.scrollTrigger.kill();
        menuRailTween.kill();
        menuRailTween = null;
      }
      gsap.set(menuTrack, { clearProps: "transform" });
    }

    function setupDesktopRail() {
      destroyMenuRailScroll();
      rail.classList.remove("menu-rail--carousel");
      menuRailTween = gsap.to(menuTrack, {
        x: function() { return -getMenuScrollDistance(); },
        ease: "none",
        scrollTrigger: {
          trigger: rail,
          start: "top top",
          end: function() { return "+=" + getMenuScrollDistance(); },
          pin: rail.querySelector(".menu-rail__pin"),
          scrub: 1.1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
    }

    function setupMobileCarousel() {
      destroyMenuRailScroll();
      rail.classList.add("menu-rail--carousel");
      if (viewport) viewport.scrollLeft = 0;
    }

    function setupMenuRail() {
      if (isMobileMenu()) setupMobileCarousel();
      else setupDesktopRail();
    }

    setupMenuRail();

    if (swipeHint) {
      var hideTimer = null;
      var hiddenByUser = false;

      function hideHint() {
        if (hiddenByUser) return;
        hiddenByUser = true;
        swipeHint.classList.remove("is-visible");
        swipeHint.classList.add("is-hidden");
      }

      function showHintIfCarousel() {
        if (!rail.classList.contains("menu-rail--carousel")) {
          swipeHint.classList.remove("is-visible");
          swipeHint.classList.add("is-hidden");
          return;
        }
        hiddenByUser = false;
        swipeHint.classList.remove("is-hidden");
        swipeHint.classList.add("is-visible");
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(hideHint, 6000);
      }

      function hideOnInteract() {
        hideHint();
        if (hideTimer) clearTimeout(hideTimer);
      }

      if (viewport) {
        viewport.addEventListener("touchstart", hideOnInteract, { passive: true, once: true });
        viewport.addEventListener("pointerdown", hideOnInteract, { passive: true, once: true });
        viewport.addEventListener("wheel", hideOnInteract, { passive: true, once: true });
        viewport.addEventListener("scroll", hideOnInteract, { passive: true, once: true });
      }

      showHintIfCarousel();
      window.addEventListener("resize", showHintIfCarousel, { passive: true });
    }

    window.addEventListener("resize", function() {
      setupMenuRail();
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh(true);
    }, { passive: true });
  }

  function initScrollReveal() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray(".section-head, .benefit-card, .review-card").forEach(function(elm) {
      gsap.from(elm, {
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: elm,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      });
    });
  }

  async function boot() {
    setPreloaderPercent(0);
    await preloadPreloader();
    runPreloader();

    if (!isMobileScene()) {
      var scene1 = createSequence({
        name: "scene1",
        folder: "scene1",
        sequenceEl: document.getElementById("heroSequence"),
        canvas: document.getElementById("heroCanvas"),
        ctx: document.getElementById("heroCanvas").getContext("2d", { alpha: false }),
        fallback: document.getElementById("heroFallback"),
        textEl: document.getElementById("heroText"),
        scrollCue: document.getElementById("scrollCue"),
        textTiming: scene1Text,
        textHoldAt80: 60,
        autoDuration: 3200,
      });

      var scene2Canvas = document.getElementById("scene2Canvas");
      var scene2 = createSequence({
        name: "scene2",
        folder: "scene2",
        sequenceEl: document.getElementById("scene2Sequence"),
        canvas: scene2Canvas,
        ctx: scene2Canvas.getContext("2d", { alpha: false }),
        fallback: document.getElementById("scene2Fallback"),
        textEl: document.getElementById("scene2Text"),
        scrollCue: null,
        textTiming: scene2Text,
        textHoldAt80: 36,
        autoDuration: 2800,
      });

      sequences.push(scene1, scene2);

      await loadImage(scene1.url(1)).then(function(img) {
        scene1.state.cache.set(1, img);
        scene1.syncMaxFrame();
      }).catch(function() {});

      scene1.requestRender();

      Promise.all([scene1.preload(), scene2.preload()]).then(function() {
        initMobileSceneAutoplay([
          { seq: scene1, el: document.getElementById("heroSequence"), holdAt80: 60 },
          { seq: scene2, el: document.getElementById("scene2Sequence"), holdAt80: 36 },
        ]);
      });
    }

    initLenis();

    window.addEventListener("scroll", function() {
      sequences.forEach(function(s) { s.requestRender(); });
      updateHeader();
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
    }, { passive: true });
    window.addEventListener("resize", function() {
      sequences.forEach(function(s) { s.requestRender(); });
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
    }, { passive: true });

    initHeader();
    initGallery();
    initLazyMenuBackgrounds();
    initReviews();
    initFaq();
    initDrinkTabs();
    initFaqCanvas();
    initBooking();
    initMenuRail();
    initScrollReveal();

    window.addEventListener("load", function() {
      if (typeof ScrollTrigger !== "undefined") {
        ScrollTrigger.refresh(true);
      }
    });
  }

  window.addEventListener("load", function() {
    sequences.forEach(function(s) { s.requestRender(); });
  });

  boot();
})();
