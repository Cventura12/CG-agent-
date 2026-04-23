export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: "easeOut" as const, delay: i * 0.055 },
  }),
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

export const slideRight = {
  hidden: { opacity: 0, x: -8 },
  visible: (i = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: "easeOut" as const, delay: i * 0.04 },
  }),
};


