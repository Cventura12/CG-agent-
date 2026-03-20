import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

export function AmbientBackground() {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to('.fieldr-ambient__glow--sienna', {
        xPercent: 8,
        yPercent: -6,
        scale: 1.08,
        duration: 18,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })

      gsap.to('.fieldr-ambient__glow--moss', {
        xPercent: -10,
        yPercent: 9,
        scale: 0.94,
        duration: 22,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })

      gsap.to('.fieldr-ambient__beam', {
        xPercent: 6,
        yPercent: -3,
        rotation: 3,
        duration: 24,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        transformOrigin: '50% 50%',
      })

      gsap.to('.fieldr-ambient__mesh', {
        backgroundPosition: '220px 140px',
        duration: 36,
        repeat: -1,
        ease: 'none',
      })
    }, rootRef)

    return () => ctx.revert()
  }, [])

  return (
    <>
      <style>{`
        .fieldr-ambient {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .fieldr-ambient__wash {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 18% 12%, rgba(212,103,63,0.08), transparent 28%),
            radial-gradient(circle at 82% 20%, rgba(90,148,105,0.07), transparent 24%),
            radial-gradient(circle at 50% 0%, rgba(239,229,216,0.025), transparent 42%),
            linear-gradient(180deg, rgba(19,17,14,0.88) 0%, rgba(13,12,10,0.94) 36%, rgba(13,12,10,1) 100%);
        }

        .fieldr-ambient__mesh {
          position: absolute;
          inset: 0;
          opacity: 0.32;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px);
          background-size: 140px 140px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.15));
        }

        .fieldr-ambient__beam {
          position: absolute;
          top: -10%;
          left: 48%;
          width: 56vw;
          height: 46vh;
          transform: translateX(-50%);
          background: radial-gradient(circle at center, rgba(212,103,63,0.08), rgba(212,103,63,0.02) 42%, transparent 72%);
          filter: blur(18px);
          opacity: 0.65;
        }

        .fieldr-ambient__glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(120px);
          opacity: 0.75;
        }

        .fieldr-ambient__glow--sienna {
          top: -6%;
          left: -10%;
          width: 34vw;
          height: 34vw;
          min-width: 320px;
          min-height: 320px;
          background: radial-gradient(circle at center, rgba(184,83,46,0.2), rgba(184,83,46,0.05) 48%, transparent 72%);
        }

        .fieldr-ambient__glow--moss {
          right: -10%;
          bottom: 4%;
          width: 28vw;
          height: 28vw;
          min-width: 260px;
          min-height: 260px;
          background: radial-gradient(circle at center, rgba(90,148,105,0.12), rgba(90,148,105,0.04) 52%, transparent 74%);
        }

        .fieldr-ambient__vignette {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(0,0,0,0.28), transparent 16%, transparent 84%, rgba(0,0,0,0.32)),
            linear-gradient(180deg, rgba(0,0,0,0.18), transparent 22%, transparent 82%, rgba(0,0,0,0.24));
        }
      `}</style>
      <div ref={rootRef} className="fieldr-ambient" aria-hidden="true">
        <div className="fieldr-ambient__wash" />
        <div className="fieldr-ambient__mesh" />
        <div className="fieldr-ambient__beam" />
        <div className="fieldr-ambient__glow fieldr-ambient__glow--sienna" />
        <div className="fieldr-ambient__glow fieldr-ambient__glow--moss" />
        <div className="fieldr-ambient__vignette" />
      </div>
    </>
  )
}
