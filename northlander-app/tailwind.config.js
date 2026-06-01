/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte}'],
  theme: {
    extend: {
      colors: {
        /* Vintage railway palette pulled from /plan so the app
           reads as a sibling of the Guide, not a stranger. */
        ivory: '#f5f0e8',
        'ivory-soft': '#ede8da',
        cream: '#fbf6ea',
        paper: '#f3e6c8',
        forest: '#0a2d21',
        'forest-2': '#1f3d2d',
        rust: '#7d3a1e',
        'rust-d': '#5e2a14',
        amber: '#c4860f',
        gold: '#c9a84c',
        ink: '#241f1a',
        muted: '#5a4f3d'
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Spline Sans"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        ticket: '0 10px 28px rgba(80, 50, 20, 0.16)',
        tag: '0 12px 28px rgba(40, 20, 5, 0.28), 0 2px 4px rgba(40, 20, 5, 0.15)'
      },
      backgroundImage: {
        /* Diagonal linen weave - same texture used on the /plan
           scrapbook so warm sections feel like aged poster paper. */
        linen:
          "repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.04) 0, rgba(45, 30, 20, 0.04) 1px, transparent 1px, transparent 9px)"
      }
    }
  },
  plugins: []
};
