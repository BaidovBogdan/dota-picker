import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Cleanup = () => void;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const initDecisionReel = (root: HTMLElement): Cleanup => {
  const reel = root.querySelector<HTMLElement>("[data-decision-reel]");
  if (!reel) return () => undefined;

  const slides = Array.from(
    reel.querySelectorAll<HTMLElement>("[data-decision-slide]")
  );
  const previous = reel.querySelector<HTMLButtonElement>("[data-reel-previous]");
  const next = reel.querySelector<HTMLButtonElement>("[data-reel-next]");
  const position = reel.querySelector<HTMLElement>("[data-reel-position]");
  const title = reel.querySelector<HTMLElement>("[data-reel-title]");
  let activeIndex = 0;
  let busy = false;

  const updateCopy = () => {
    const activeSlide = slides[activeIndex];
    if (position) position.textContent = `${activeIndex + 1} / ${slides.length}`;
    if (title) title.textContent = activeSlide?.dataset.title ?? "";
  };

  const showSlide = (nextIndex: number, direction: number) => {
    if (busy || nextIndex === activeIndex || !slides[nextIndex]) return;

    const currentSlide = slides[activeIndex];
    const incomingSlide = slides[nextIndex];
    activeIndex = nextIndex;
    updateCopy();

    if (prefersReducedMotion()) {
      currentSlide.hidden = true;
      incomingSlide.hidden = false;
      return;
    }

    busy = true;
    gsap.to(currentSlide, {
      autoAlpha: 0,
      x: -24 * direction,
      duration: 0.22,
      ease: "power2.in",
      onComplete: () => {
        currentSlide.hidden = true;
        incomingSlide.hidden = false;
        gsap.fromTo(
          incomingSlide,
          { autoAlpha: 0, x: 34 * direction },
          {
            autoAlpha: 1,
            x: 0,
            duration: 0.46,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
            onComplete: () => {
              busy = false;
            }
          }
        );
      }
    });
  };

  const move = (direction: number) => {
    const nextIndex =
      (activeIndex + direction + slides.length) % slides.length;
    showSlide(nextIndex, direction);
  };

  const onPrevious = () => move(-1);
  const onNext = () => move(1);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  };

  previous?.addEventListener("click", onPrevious);
  next?.addEventListener("click", onNext);
  reel.addEventListener("keydown", onKeyDown);

  return () => {
    previous?.removeEventListener("click", onPrevious);
    next?.removeEventListener("click", onNext);
    reel.removeEventListener("keydown", onKeyDown);
  };
};

const initDecisionField = (root: HTMLElement): Cleanup => {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-decision-field]");
  const host = canvas?.parentElement;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;

  if (
    !canvas ||
    !host ||
    prefersReducedMotion() ||
    connection?.saveData ||
    !window.matchMedia("(pointer: fine)").matches
  ) {
    return () => undefined;
  }

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => undefined;

  let width = 1;
  let height = 1;
  let dpr = 1;
  let frame = 0;
  let visible = true;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = (time: number) => {
    if (!visible || document.hidden) {
      frame = requestAnimationFrame(draw);
      return;
    }

    pointerX += (targetX - pointerX) * 0.045;
    pointerY += (targetY - pointerY) * 0.045;
    context.clearRect(0, 0, width, height);

    const centerX = width * 0.5 + pointerX * 18;
    const centerY = height * 0.5 + pointerY * 14;
    const baseRadius = Math.min(width, height) * 0.34;
    const phase = time * 0.00008;

    context.save();
    context.globalCompositeOperation = "multiply";
    context.lineCap = "round";

    for (let index = 0; index < 42; index += 1) {
      const angle = phase + (index / 42) * Math.PI * 2;
      const wave = Math.sin(time * 0.00045 + index * 1.71) * 13;
      const radius = baseRadius + wave + (index % 3) * 9;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const answer = index % 14 === 0;
      const size = answer ? 4.2 : 1.2 + (index % 4) * 0.45;

      context.beginPath();
      context.fillStyle = answer
        ? "rgba(241,34,24,0.54)"
        : "rgba(16,18,23,0.12)";
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();

      if (index % 2 === 0) {
        context.beginPath();
        context.strokeStyle = answer
          ? "rgba(241,34,24,0.16)"
          : "rgba(16,18,23,0.045)";
        context.lineWidth = answer ? 1.4 : 0.8;
        context.moveTo(x, y);
        context.lineTo(
          centerX + Math.cos(angle + 0.16) * baseRadius * 0.48,
          centerY + Math.sin(angle + 0.16) * baseRadius * 0.48
        );
        context.stroke();
      }
    }

    context.restore();
    frame = requestAnimationFrame(draw);
  };

  const onPointerMove = (event: PointerEvent) => {
    const bounds = host.getBoundingClientRect();
    targetX = (event.clientX - bounds.left) / bounds.width - 0.5;
    targetY = (event.clientY - bounds.top) / bounds.height - 0.5;
  };

  const onPointerLeave = () => {
    targetX = 0;
    targetY = 0;
  };

  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? false;
    },
    { rootMargin: "120px" }
  );

  resizeObserver.observe(host);
  intersectionObserver.observe(host);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  resize();
  frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerleave", onPointerLeave);
  };
};

const initMotion = (root: HTMLElement): Cleanup => {
  const media = gsap.matchMedia();
  const context = gsap.context(() => {
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        const pageOrbit = root.querySelector<HTMLElement>(
          "[data-motion='page-orbit']"
        );
        const introTimeline = gsap.timeline({
          defaults: { ease: "power4.out" }
        });

        gsap.set(pageOrbit ?? [], {
          xPercent: -50,
          yPercent: -50,
          scale: 1,
          transformOrigin: "50% 50%"
        });
        gsap.set("[data-motion='hero-title'] > span", {
          clipPath: "inset(0 0 100% 0)",
          yPercent: 26
        });
        gsap.set(
          "[data-motion='hero-context'], [data-motion='hero-subhead'], [data-motion='hero-actions']",
          { autoAlpha: 0, y: 22 }
        );
        gsap.set("[data-motion='hero-proof']", {
          autoAlpha: 0,
          y: 70,
          scale: 0.96
        });
        gsap.set(
          "[data-motion='page-orbit'] .brand-mark__shard, [data-motion='page-orbit'] .brand-mark__answer",
          {
            autoAlpha: 0,
            scale: 0.16,
            rotation: (index) => -34 + index * 4,
            transformOrigin: "50% 50%"
          }
        );

        introTimeline
          .to("[data-motion='hero-context']", {
            autoAlpha: 1,
            y: 0,
            duration: 0.55
          })
          .to(
            "[data-motion='hero-title'] > span",
            {
              clipPath: "inset(0 0 0% 0)",
              yPercent: 0,
              duration: 0.9,
              stagger: 0.08
            },
            0.08
          )
          .to(
            "[data-motion='hero-subhead'], [data-motion='hero-actions']",
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.7,
              stagger: 0.08
            },
            0.34
          )
          .to(
            "[data-motion='page-orbit'] .brand-mark__shard",
            {
              autoAlpha: 1,
              scale: 1,
              rotation: 0,
              duration: 0.88,
              stagger: 0.025
            },
            0.22
          )
          .to(
            "[data-motion='page-orbit'] .brand-mark__answer",
            {
              autoAlpha: 1,
              scale: 1,
              rotation: 0,
              duration: 0.62,
              stagger: 0.055
            },
            0.73
          )
          .to(
            "[data-motion='hero-proof']",
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.9
            },
            0.72
          );

        const interestHeadingTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: ".interest-heading",
            start: "top 89%",
            end: "top 46%",
            scrub: 0.38
          }
        });

        interestHeadingTimeline
          .from(".interest-heading > *", {
            y: 64,
            autoAlpha: 0,
            stagger: 0.08,
            duration: 0.72
          })
          .fromTo(
            ".interest-current span",
            { scaleY: 0 },
            { scaleY: 1, transformOrigin: "top", duration: 0.72 },
            0
          );

        const signalTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: "[data-motion='signal-surface']",
            start: "top 88%",
            end: "top 42%",
            scrub: 0.4
          }
        });

        signalTimeline
          .from("[data-motion='signal-surface'] .signal-cell", {
            y: 72,
            autoAlpha: 0,
            scale: 0.975,
            stagger: 0.055,
            duration: 0.55
          })
          .from(
            ".detected-roster figure",
            {
              x: -56,
              autoAlpha: 0,
              rotate: -7,
              stagger: 0.03,
              duration: 0.34
            },
            0.16
          )
          .from(
            ".candidate-collapse__final strong",
            {
              x: 34,
              autoAlpha: 0,
              stagger: 0.045,
              duration: 0.32
            },
            0.28
          );

        gsap
          .timeline({
            scrollTrigger: {
              trigger: ".workflow-heading",
              start: "top 89%",
              end: "top 46%",
              scrub: 0.38
            }
          })
          .from(".workflow-heading > *", {
            y: 58,
            autoAlpha: 0,
            stagger: 0.08,
            duration: 0.7
          });

        gsap
          .timeline({
            scrollTrigger: {
              trigger: "[data-motion='workflow-accordion']",
              start: "top 88%",
              end: "top 42%",
              scrub: 0.4
            }
          })
          .from("[data-motion='workflow-accordion'] article", {
            y: 64,
            autoAlpha: 0,
            stagger: 0.055,
            duration: 0.72
          });

        const decisionTraceTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: ".decision-trace",
            start: "top 88%",
            end: "top 42%",
            scrub: 0.42
          }
        });

        gsap.set(".decision-trace__route", {
          strokeDasharray: 1,
          strokeDashoffset: 1
        });

        decisionTraceTimeline
          .from(".engine-trust__copy > *", {
            y: 44,
            autoAlpha: 0,
            stagger: 0.08,
            duration: 0.28
          })
          .from(
            ".decision-trace__heading > *",
            {
              y: 18,
              autoAlpha: 0,
              stagger: 0.05,
              duration: 0.2
            },
            0.04
          )
          .from(
            ".decision-trace__input",
            {
              x: -24,
              autoAlpha: 0,
              stagger: 0.035,
              duration: 0.24
            },
            0.1
          )
          .to(
            ".decision-trace__route--input",
            {
              strokeDashoffset: 0,
              stagger: 0.045,
              duration: 0.34,
              ease: "none"
            },
            0.18
          )
          .from(
            ".decision-trace__core",
            {
              scale: 0.66,
              rotation: -14,
              autoAlpha: 0,
              duration: 0.26
            },
            0.35
          )
          .to(
            ".decision-trace__route--output",
            {
              strokeDashoffset: 0,
              duration: 0.24,
              ease: "none"
            },
            0.53
          )
          .from(
            ".decision-trace__result",
            {
              x: 34,
              autoAlpha: 0,
              scale: 0.94,
              duration: 0.3
            },
            0.61
          );

        gsap.from(".plan-path", {
          y: 72,
          autoAlpha: 0,
          stagger: 0.07,
          duration: 0.72,
          scrollTrigger: {
            trigger: ".plan-paths",
            start: "top 88%",
            end: "top 43%",
            scrub: 0.4
          }
        });

        gsap.fromTo(
          ".pricing-current span",
          { scaleX: 0 },
          {
            scaleX: 1,
            transformOrigin: "center",
            stagger: 0.08,
            duration: 0.7,
            scrollTrigger: {
              trigger: ".pricing-heading",
              start: "top 89%",
              end: "top 46%",
              scrub: 0.38
            }
          }
        );

      }
    );

    media.add(
      "(min-width: 960px) and (prefers-reduced-motion: no-preference)",
      () => {
        const stage = root.querySelector<HTMLElement>("[data-motion='experience-stage']");
        const pageOrbit = root.querySelector<HTMLElement>(
          "[data-motion='page-orbit']"
        );
        const steps = Array.from(
          root.querySelectorAll<HTMLElement>("[data-story-step]")
        );
        const rankingBoard = root.querySelector<HTMLElement>(
          "[data-ranking-board]"
        );
        const rankingCandidates = Array.from(
          root.querySelectorAll<HTMLElement>("[data-ranking-pool] figure")
        );
        const rankingFinalists = Array.from(
          root.querySelectorAll<HTMLElement>(
            "[data-ranking-pool] figure[data-finalist='true']"
          )
        );
        const rankingRejected = Array.from(
          root.querySelectorAll<HTMLElement>(
            "[data-ranking-pool] figure[data-finalist='false']"
          )
        );
        const rankingShortlist = Array.from(
          root.querySelectorAll<HTMLElement>(
            "[data-ranking-shortlist] figure"
          )
        );
        const rankingSignals = Array.from(
          root.querySelectorAll<HTMLElement>("[data-ranking-signal]")
        );

        gsap.set(steps, { autoAlpha: 0, y: 22 });
        gsap.set(steps[0] ?? [], { autoAlpha: 1, y: 0 });
        gsap.set(".enemy-locks figure", { autoAlpha: 0.18, scale: 0.72 });
        gsap.set(rankingBoard ?? [], {
          autoAlpha: 0,
          scale: 0.96,
          clipPath: "inset(5% 6% 5% 6% round 30px)"
        });
        gsap.set(rankingCandidates, {
          autoAlpha: 0,
          x: -26,
          scale: 0.95
        });
        gsap.set("[data-ranking-core]", {
          autoAlpha: 0,
          scale: 0.68,
          rotation: -12
        });
        gsap.set(rankingSignals, { autoAlpha: 0, y: 12 });
        gsap.set(rankingShortlist, {
          autoAlpha: 0,
          x: 34,
          scale: 0.94
        });
        gsap.set(".counterpick-overlay", {
          autoAlpha: 0,
          clipPath: "inset(48% 0 48% 0 round 28px)"
        });
        gsap.set(".recommendation-card", {
          autoAlpha: 0,
          y: 58,
          scale: 0.9
        });
        gsap.set(".overlay-reason", { autoAlpha: 0, y: 12 });

        const decisionTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: "[data-motion='draft-pin']",
            start: "top top",
            end: () => `+=${Math.max(window.innerHeight * 3.4, 2600)}`,
            pin: true,
            scrub: 0.72,
            anticipatePin: 1,
            refreshPriority: 1,
            invalidateOnRefresh: true
          },
          onUpdate() {
            if (!stage) return;
            const progress = decisionTimeline.progress();
            stage.dataset.scene =
              progress < 0.24
                ? "draft"
                : progress < 0.73
                  ? "ranking"
                  : "overlay";
          }
        });

        decisionTimeline
          .to(".enemy-locks figure", {
            autoAlpha: 1,
            scale: 1,
            stagger: 0.026,
            duration: 0.15
          }, 0.02)
          .to(
            ".game-world__river, .game-world__lane, .game-world__tower",
            {
              autoAlpha: 0.26,
              duration: 0.1
            },
            0.18
          )
          .to(
            rankingBoard ?? [],
            {
              autoAlpha: 1,
              scale: 1,
              clipPath: "inset(0% 0% 0% 0% round 30px)",
              duration: 0.11
            },
            0.21
          )
          .to(steps[0] ?? [], {
            autoAlpha: 0,
            y: -18,
            duration: 0.07
          }, 0.23)
          .to(steps[1] ?? [], {
            autoAlpha: 1,
            y: 0,
            duration: 0.1
          }, 0.28)
          .to(
            rankingCandidates,
            {
              autoAlpha: 1,
              x: 0,
              scale: 1,
              stagger: 0.012,
              duration: 0.12
            },
            0.27
          )
          .to(
            "[data-ranking-core]",
            {
              autoAlpha: 1,
              scale: 1,
              rotation: 0,
              duration: 0.14
            },
            0.36
          )
          .to(
            rankingSignals,
            {
              autoAlpha: 1,
              y: 0,
              stagger: 0.028,
              duration: 0.13
            },
            0.39
          )
          .to(
            rankingFinalists,
            {
              x: 10,
              scale: 1.03,
              duration: 0.12,
              stagger: 0.015
            },
            0.54
          )
          .to(
            rankingRejected,
            {
              autoAlpha: 0.08,
              x: -34,
              scale: 0.88,
              duration: 0.12,
              stagger: 0.008
            },
            0.55
          )
          .to(
            rankingShortlist,
            {
              autoAlpha: 1,
              x: 0,
              scale: 1,
              stagger: 0.026,
              duration: 0.13
            },
            0.59
          )
          .to(steps[1] ?? [], {
            autoAlpha: 0,
            y: -18,
            duration: 0.07
          }, 0.7)
          .to(steps[2] ?? [], {
            autoAlpha: 1,
            y: 0,
            duration: 0.1
          }, 0.74)
          .to(
            rankingBoard ?? [],
            {
              autoAlpha: 0,
              scale: 1.015,
              duration: 0.09
            },
            0.72
          )
          .to(
            ".counterpick-overlay",
            {
              autoAlpha: 1,
              clipPath: "inset(0% 0 0% 0 round 28px)",
              duration: 0.13
            },
            0.75
          )
          .to(
            ".recommendation-card",
            {
              autoAlpha: 1,
              y: (index) => index * -8,
              scale: 1,
              stagger: 0.025,
              duration: 0.14
            },
            0.81
          )
          .to(
            ".overlay-reason",
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.1
            },
            0.9
          )
          .fromTo(
            ".story-progress span",
            { scaleX: 0 },
            { scaleX: 1, transformOrigin: "left", duration: 1, ease: "none" },
            0
          );

        if (pageOrbit) {
          type OrbitPoint = {
            scroll: number;
            x: number;
            y: number;
            scale: number;
            opacity: number;
            ink: string;
          };

          let orbitPoints: OrbitPoint[] = [];
          let activeInk = "";
          let inkTween: gsap.core.Tween | null = null;
          const pageOrbitSpinner = pageOrbit.querySelector<HTMLElement>(
            ".page-orbit__spinner"
          );
          const orbitX = gsap.quickTo(pageOrbit, "x", {
            duration: 0.48,
            ease: "power3.out"
          });
          const orbitY = gsap.quickTo(pageOrbit, "y", {
            duration: 0.55,
            ease: "power3.out"
          });
          const orbitScaleX = gsap.quickTo(pageOrbit, "scaleX", {
            duration: 0.52,
            ease: "power3.out"
          });
          const orbitScaleY = gsap.quickTo(pageOrbit, "scaleY", {
            duration: 0.52,
            ease: "power3.out"
          });
          const orbitOpacity = gsap.quickTo(pageOrbit, "opacity", {
            duration: 0.34,
            ease: "power2.out"
          });
          const orbitRotation = pageOrbitSpinner
            ? gsap.quickTo(pageOrbitSpinner, "rotation", {
                duration: 0.28,
                ease: "power1.out"
              })
            : null;

          const sectionMetrics = (selector: string) => {
            const element = root.querySelector<HTMLElement>(selector);
            if (!element) return null;
            const bounds = element.getBoundingClientRect();
            return {
              top: bounds.top + window.scrollY,
              height: bounds.height
            };
          };

          const measureOrbit = () => {
            const viewportHeight = window.innerHeight;
            const travel = Math.min(
              820,
              Math.max(340, window.innerWidth * 0.36)
            );
            const maxScroll = ScrollTrigger.maxScroll(window);
            const pinStart = decisionTimeline.scrollTrigger?.start ?? 0;
            const pinEnd = decisionTimeline.scrollTrigger?.end ?? pinStart;
            const point = (
              selector: string,
              sectionProgress: number,
              viewportRatio: number,
              xFactor: number,
              y: number,
              scale: number,
              opacity: number,
              ink: string,
              minimum = 0
            ): OrbitPoint | null => {
              const section = sectionMetrics(selector);
              if (!section) return null;

              return {
                scroll: Math.min(
                  maxScroll,
                  Math.max(
                    minimum,
                    section.top +
                      section.height * sectionProgress -
                      viewportHeight * viewportRatio
                  )
                ),
                x: travel * xFactor,
                y,
                scale,
                opacity,
                ink
              };
            };

            const measured = [
              {
                scroll: 0,
                x: 0,
                y: 0,
                scale: 1,
                opacity: 0.095,
                ink: "#101217"
              },
              point(
                ".interest-section",
                0,
                0.86,
                0,
                18,
                1,
                0.038,
                "#f9f6f0"
              ),
              point(
                ".interest-section",
                0.34,
                0.52,
                -0.72,
                -54,
                0.84,
                0.038,
                "#f9f6f0"
              ),
              point(
                ".interest-section",
                0.76,
                0.52,
                0.78,
                48,
                0.92,
                0.038,
                "#f9f6f0"
              ),
              {
                scroll: pinStart,
                x: travel * -0.94,
                y: 0,
                scale: 1.08,
                opacity: 0.036,
                ink: "#f9f6f0"
              },
              {
                scroll: pinEnd,
                x: travel * -0.94,
                y: 0,
                scale: 1.08,
                opacity: 0.036,
                ink: "#f9f6f0"
              },
              point(
                ".evidence-section",
                0,
                0.86,
                -0.94,
                0,
                1.08,
                0.06,
                "#101217",
                pinEnd + 1
              ),
              point(
                ".evidence-section",
                0.36,
                0.52,
                0.9,
                -58,
                0.86,
                0.06,
                "#101217",
                pinEnd + 1
              ),
              point(
                ".evidence-section",
                0.76,
                0.52,
                -0.72,
                52,
                0.82,
                0.06,
                "#101217",
                pinEnd + 1
              ),
              point(
                ".pricing-section",
                0,
                0.86,
                0.8,
                -42,
                0.96,
                0.035,
                "#f9f6f0",
                pinEnd + 1
              ),
              point(
                ".faq-section",
                0,
                0.86,
                -0.82,
                52,
                0.86,
                0.055,
                "#101217",
                pinEnd + 1
              ),
              point(
                ".final-cta",
                0,
                0.86,
                0.88,
                0,
                1,
                0.1,
                "#101217",
                pinEnd + 1
              ),
              {
                scroll: maxScroll,
                x: 0,
                y: 0,
                scale: 1.04,
                opacity: 0.028,
                ink: "#f9f6f0"
              }
            ]
              .filter((item): item is OrbitPoint => item !== null)
              .sort((left, right) => left.scroll - right.scroll);

            orbitPoints = [];
            measured.forEach((item, index) => {
              const isLast = index === measured.length - 1;
              const previous = orbitPoints.at(-1);
              const scroll = previous
                ? Math.max(previous.scroll + 1, item.scroll)
                : Math.max(0, item.scroll);

              if (!isLast && scroll >= maxScroll) return;
              orbitPoints.push({
                ...item,
                scroll: isLast ? maxScroll : scroll
              });
            });
          };

          const orbitState = (scroll: number) => {
            const first = orbitPoints[0] ?? {
              scroll: 0,
              x: 0,
              y: 0,
              scale: 1,
              opacity: 0.095,
              ink: "#101217"
            };
            const last = orbitPoints.at(-1) ?? first;

            if (scroll <= first.scroll) return { ...first, index: 0 };
            if (scroll >= last.scroll) {
              return {
                ...last,
                index: Math.max(0, orbitPoints.length - 1)
              };
            }

            for (let index = 1; index < orbitPoints.length; index += 1) {
              const right = orbitPoints[index];
              const left = orbitPoints[index - 1];
              if (!right || !left || scroll > right.scroll) continue;

              const distance = Math.max(1, right.scroll - left.scroll);
              const progress = Math.min(
                1,
                Math.max(0, (scroll - left.scroll) / distance)
              );
              const eased = progress * progress * (3 - 2 * progress);

              return {
                scroll,
                x: left.x + (right.x - left.x) * eased,
                y: left.y + (right.y - left.y) * eased,
                scale: left.scale + (right.scale - left.scale) * eased,
                opacity:
                  left.opacity + (right.opacity - left.opacity) * eased,
                ink: left.ink,
                index: index - 1
              };
            }

            return {
              ...last,
              index: Math.max(0, orbitPoints.length - 1)
            };
          };

          const renderOrbit = (scroll: number, immediate = false) => {
            const state = orbitState(scroll);
            const rotation =
              (scroll / Math.max(1, ScrollTrigger.maxScroll(window))) * 720;

            if (state.ink !== activeInk) {
              activeInk = state.ink;
              inkTween?.kill();
              if (immediate) {
                gsap.set(pageOrbit, { "--orbit-ink": state.ink });
              } else {
                inkTween = gsap.to(pageOrbit, {
                  "--orbit-ink": state.ink,
                  duration: 0.42,
                  ease: "power2.out",
                  overwrite: "auto"
                });
              }
            }

            if (immediate) {
              orbitX(state.x).progress(1);
              orbitY(state.y).progress(1);
              orbitScaleX(state.scale).progress(1);
              orbitScaleY(state.scale).progress(1);
              orbitOpacity(state.opacity).progress(1);
              orbitRotation?.(rotation).progress(1);
              return;
            }

            orbitX(state.x);
            orbitY(state.y);
            orbitScaleX(state.scale);
            orbitScaleY(state.scale);
            orbitOpacity(state.opacity);
            orbitRotation?.(rotation);
          };

          measureOrbit();
          renderOrbit(window.scrollY, true);

          const orbitTrigger = ScrollTrigger.create({
            trigger: root,
            start: "top top",
            end: "max",
            refreshPriority: -10,
            invalidateOnRefresh: true,
            onRefresh(self) {
              measureOrbit();
              renderOrbit(self.scroll(), true);
            },
            onUpdate(self) {
              renderOrbit(self.scroll());
            }
          });

          return () => {
            orbitTrigger.kill();
            orbitX.tween.kill();
            orbitY.tween.kill();
            orbitScaleX.tween.kill();
            orbitScaleY.tween.kill();
            orbitOpacity.tween.kill();
            orbitRotation?.tween.kill();
            inkTween?.kill();
          };
        }
      }
    );

    media.add(
      "(max-width: 959px) and (prefers-reduced-motion: no-preference)",
      () => {
        gsap.from(".experience-stage", {
          scale: 0.88,
          autoAlpha: 0.3,
          scrollTrigger: {
            trigger: ".experience-stage",
            start: "top 92%",
            end: "center 54%",
            scrub: 0.75
          }
        });

        gsap.from(".recommendation-card", {
          x: 38,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".counterpick-overlay",
            start: "top 78%",
            once: true
          }
        });
      }
    );

    ScrollTrigger.create({
      trigger: ".hero-section",
      start: "bottom 84px",
      end: "max",
      toggleClass: {
        targets: "[data-motion='site-nav']",
        className: "is-condensed"
      }
    });
  }, root);

  void document.fonts.ready.then(() => ScrollTrigger.refresh());

  return () => {
    media.revert();
    context.revert();
  };
};

export const initLanding = () => {
  const root = document.querySelector<HTMLElement>(".site-root");
  if (!root || document.documentElement.dataset.counterpickReady === "true") {
    return;
  }

  document.documentElement.dataset.counterpickReady = "true";
  document.documentElement.classList.add("motion-ready");
  const cleanupReel = initDecisionReel(root);
  const cleanupField = initDecisionField(root);
  const cleanupMotion = initMotion(root);

  window.addEventListener(
    "pagehide",
    () => {
      cleanupReel();
      cleanupField();
      cleanupMotion();
      delete document.documentElement.dataset.counterpickReady;
      document.documentElement.classList.remove("motion-ready");
    },
    { once: true }
  );
};
