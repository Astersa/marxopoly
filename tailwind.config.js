export default {
  content: ['./src/client/**/*.{html,tsx,ts}'],
  theme: { extend: {
    colors: { coal: '#16130f', coal2: '#201b15', coal3: '#2c261d', paper: '#efe3c6', paper2: '#e3d4ae', ink: '#1d1a14', vermilion: '#d63a1f', brass: '#c9962b' },
    fontFamily: { display: ['Anton', 'Impact', 'sans-serif'], cond: ['"Barlow Condensed"', 'sans-serif'], sans: ['Barlow', 'system-ui', 'sans-serif'] },
  } },
  plugins: [],
};
