/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Genius Halo — Primary Accent (bows / left eye / armor joints)
        halo: {
          pink: {
            DEFAULT: "#F2A8C4",
            soft: "#F8C5D8",
            deep: "#D97A9C",
            glow: "#FFE0EC",
          },
          // Genius Halo — Secondary Accent (right eye / cyan hair tips / vials)
          cyan: {
            DEFAULT: "#5BC4E8",
            soft: "#9ADEF0",
            deep: "#2A9FC4",
            glow: "#D6F4FF",
          },
        },
        // Light Mode — "Apron" theme (crisp white frills)
        apron: {
          DEFAULT: "#FFFEFB",
          muted: "#F5F2ED",
          line: "#E8E2DA",
          ink: "#2A2A2E",
          soft: "#5C5A62",
        },
        // Dark Mode — "Skirt" theme (charcoal pleats / tactical gear)
        skirt: {
          DEFAULT: "#1A1A1C",
          muted: "#26262A",
          line: "#3A3A40",
          ink: "#F0EEF2",
          soft: "#A8A6B0",
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', "Candara", "Calibri", "sans-serif"],
        body: ['"Segoe UI"', "Candara", "Calibri", "sans-serif"],
      },
      boxShadow: {
        spine: "0 0 18px rgba(242, 168, 196, 0.45)",
        drawer: "-12px 0 40px rgba(26, 26, 28, 0.28)",
        "drawer-dark": "-12px 0 40px rgba(0, 0, 0, 0.55)",
      },
      transitionDuration: {
        theme: "280ms",
      },
    },
  },
  plugins: [],
};
