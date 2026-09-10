// Config usada una sola vez para generar vendor/tailwind-output.css con la CLI de
// Tailwind (ver CLAUDE.md). No es parte del deploy — GitHub Pages sirve el CSS ya
// generado, este archivo solo hace falta si en algún momento hay que regenerarlo.
module.exports = {
  content: ["./index.html", "./privacidad.html", "./terminos.html", "./app.js"],
  theme: {
    extend: {
      fontFamily: { display: ['"Space Grotesk"', "sans-serif"] }
    }
  },
  plugins: []
};
