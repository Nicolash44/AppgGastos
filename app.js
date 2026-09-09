const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Se usa una sola vez por usuario nuevo, para poblar su tabla "categorias" en Supabase.
// Una vez sembradas, cada usuario las administra desde la app (agregar/eliminar).
const CATEGORIAS_DEFAULT = {
  ingreso: ["Sueldo", "Freelance/Changas", "Otros"],
  gasto: ["Mercado", "Nafta", "Mantenimiento Auto", "Servicios", "Vivienda", "Salud", "Seguro", "Tarjeta de Crédito", "Ocio", "Ropa", "Otros"]
};

function loginApp() {
  return {
    session: null,
    vista: "landing", // landing | login | registro
    email: "",
    password: "",
    password2: "",
    errorMsg: "",
    infoMsg: "",

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        this.session = session;
      });
    },

    irALogin() {
      this.vista = "login";
      this.errorMsg = "";
      this.infoMsg = "";
    },

    irARegistro() {
      this.vista = "registro";
      this.errorMsg = "";
      this.infoMsg = "";
    },

    async login() {
      this.errorMsg = "";
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: this.email,
        password: this.password
      });
      if (error) {
        this.errorMsg = "Email o contraseña incorrectos";
      }
    },

    async registrarse() {
      this.errorMsg = "";
      this.infoMsg = "";

      if (this.password.length < 8) {
        this.errorMsg = "La contraseña tiene que tener al menos 8 caracteres";
        return;
      }
      if (this.password !== this.password2) {
        this.errorMsg = "Las contraseñas no coinciden";
        return;
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email: this.email,
        password: this.password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        this.errorMsg = error.message.includes("already registered") || error.message.includes("already been registered")
          ? "Ese email ya tiene una cuenta. Probá ingresar."
          : "No se pudo crear la cuenta. Revisá el email e intentá de nuevo.";
        return;
      }

      if (!data.session) {
        // requiere confirmación por email (SMTP con dominio verificado)
        this.infoMsg = "Te mandamos un mail para confirmar tu cuenta. Revisalo (y la carpeta de spam) y después volvé a entrar.";
      }
      // si data.session existe, onAuthStateChange actualiza this.session solo y arranca la app
    }
  };
}

// Reemplazá por tu alias real de Mercado Pago (o CBU/CVU) para recibir transferencias
const ALIAS_PAGO = "ingresos247";

function gastosApp() {
  return {
    session: null,
    perfil: null, // { trial_inicio, pagado, pago_solicitado } | null mientras carga
    aliasPago: ALIAS_PAGO,
    mostrarPago: false,
    tipo: "gasto",
    categoria: "",
    detalle: "",
    monto: "",
    movimientos: [],
    errorMsg: "",
    chartCategorias: null,
    chartEvolucion: null,
    chartComparacion: null,
    mesSeleccionado: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    // --- categorías por usuario ---
    categorias: { ingreso: [], gasto: [] },
    editandoCategorias: false,
    nuevaCategoria: "",

    // --- comparativo de meses ---
    mostrarComparacion: false,
    compTipo: "gasto",
    compCategoria: "",
    compMesA: "",
    compMesB: "",
    comparacion: null,

    // --- layout / dispositivo ---
    esMobile: window.matchMedia("(max-width: 767px)").matches,

    get categoriasActuales() {
      return this.categorias[this.tipo];
    },
    get categoriasCompActuales() {
      return this.categorias[this.compTipo];
    },
    get puedeGuardar() {
      return this.categoria && this.monto && parseFloat(this.monto) > 0;
    },
    get totalIngresos() {
      return this.movimientos.filter(m => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
    },
    get totalGastos() {
      return this.movimientos.filter(m => m.tipo === "gasto").reduce((s, m) => s + Number(m.monto), 0);
    },
    get balance() {
      return this.totalIngresos - this.totalGastos;
    },
    get mesSeleccionadoLabel() {
      return this.mesSeleccionado.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    },
    get esMesActual() {
      const hoy = new Date();
      return this.mesSeleccionado.getFullYear() === hoy.getFullYear() &&
             this.mesSeleccionado.getMonth() === hoy.getMonth();
    },
    pagoVigente() {
      if (!this.perfil || !this.perfil.pagado_hasta) return false;
      return new Date(this.perfil.pagado_hasta) > new Date();
    },
    get diasRestantesTrial() {
      if (!this.perfil || this.pagoVigente()) return null;
      const vence = new Date(this.perfil.trial_inicio);
      vence.setDate(vence.getDate() + 5);
      const dias = Math.ceil((vence - new Date()) / (1000 * 60 * 60 * 24));
      return Math.max(0, dias);
    },
    get diasRestantesPago() {
      if (!this.perfil || !this.perfil.pagado_hasta) return null;
      const dias = Math.ceil((new Date(this.perfil.pagado_hasta) - new Date()) / (1000 * 60 * 60 * 24));
      return dias > 0 ? dias : null;
    },
    get bloqueado() {
      if (!this.perfil) return false; // todavía no cargó: no mostrar bloqueo de arranque
      if (this.pagoVigente()) return false;
      return this.diasRestantesTrial === 0;
    },

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        if (session) this.arrancar();
      });
      if (this.session) this.arrancar();

      window.matchMedia("(max-width: 767px)").addEventListener("change", (e) => {
        this.esMobile = e.matches;
      });
    },

    async arrancar() {
      await this.cargarPerfil();
      if (this.bloqueado) return; // no cargar nada más si la cuenta está bloqueada

      this.mostrarComparacion = !this.esMobile;
      await this.cargarCategorias();
      this.setTipo("gasto");

      const hoy = new Date();
      this.compMesA = this.formatMesInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      this.compMesB = this.formatMesInput(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));

      this.cargarTodo();
      this.cargarComparacion();
    },

    formatMesInput(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    },

    setTipo(t) {
      this.tipo = t;
      this.categoria = "";
    },

    async logout() {
      await supabaseClient.auth.signOut();
    },

    async cargarPerfil() {
      const { data, error } = await supabaseClient
        .from("perfiles")
        .select("trial_inicio, pagado_hasta, pago_solicitado")
        .single();
      if (!error) this.perfil = data;
    },

    async marcarPagoTransferido() {
      const { error } = await supabaseClient.rpc("solicitar_pago");
      if (!error) {
        this.perfil = { ...this.perfil, pago_solicitado: new Date().toISOString() };
      }
    },

    async copiarAlias() {
      try {
        await navigator.clipboard.writeText(this.aliasPago);
      } catch (e) {
        // si el navegador bloquea el clipboard, no rompe nada, el usuario copia a mano
      }
    },

    // ==================== CATEGORÍAS ====================

    async cargarCategorias() {
      const { data, error } = await supabaseClient
        .from("categorias")
        .select("*")
        .order("orden", { ascending: true });

      if (error) return;

      if (!data || data.length === 0) {
        await this.sembrarCategoriasDefault();
        return this.cargarCategorias();
      }

      const agrupadas = { ingreso: [], gasto: [] };
      data.forEach(c => agrupadas[c.tipo].push(c));
      this.categorias = agrupadas;
    },

    async sembrarCategoriasDefault() {
      const filas = [];
      let orden = 0;
      for (const tipo of ["ingreso", "gasto"]) {
        CATEGORIAS_DEFAULT[tipo].forEach(nombre => {
          filas.push({ tipo, nombre, orden: orden++ });
        });
      }
      await supabaseClient.from("categorias").insert(filas);
    },

    toggleEditarCategorias() {
      this.editandoCategorias = !this.editandoCategorias;
      this.nuevaCategoria = "";
    },

    async agregarCategoria() {
      const nombre = this.nuevaCategoria.trim();
      if (!nombre) return;

      const yaExiste = this.categorias[this.tipo].some(c => c.nombre.toLowerCase() === nombre.toLowerCase());
      if (yaExiste) {
        this.nuevaCategoria = "";
        return;
      }

      const orden = this.categorias[this.tipo].length;
      const { error } = await supabaseClient.from("categorias").insert({ tipo: this.tipo, nombre, orden });
      if (!error) {
        this.nuevaCategoria = "";
        await this.cargarCategorias();
      }
    },

    async eliminarCategoria(cat) {
      if (!confirm(`¿Eliminar la categoría "${cat.nombre}"? Los movimientos ya cargados con esta categoría no se modifican.`)) return;
      const { error } = await supabaseClient.from("categorias").delete().eq("id", cat.id);
      if (!error) await this.cargarCategorias();
    },

    // ==================== MES ACTUAL / MOVIMIENTOS ====================

    mesAnterior() {
      this.mesSeleccionado = new Date(this.mesSeleccionado.getFullYear(), this.mesSeleccionado.getMonth() - 1, 1);
      this.cargarTodo();
    },
    mesSiguiente() {
      if (this.esMesActual) return;
      this.mesSeleccionado = new Date(this.mesSeleccionado.getFullYear(), this.mesSeleccionado.getMonth() + 1, 1);
      this.cargarTodo();
    },

    async cargarTodo() {
      await this.cargarMovimientos();
      await this.cargarEvolucion();
    },

    async cargarMovimientos() {
      const inicio = this.mesSeleccionado;
      const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
      const inicioStr = inicio.toISOString().slice(0, 10);
      const finStr = fin.toISOString().slice(0, 10);

      const { data, error } = await supabaseClient
        .from("transacciones")
        .select("*")
        .gte("fecha", inicioStr)
        .lt("fecha", finStr)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });

      if (!error) {
        this.movimientos = data;
        this.renderChartCategorias();
      }
    },

    async cargarEvolucion() {
      const inicio = new Date(this.mesSeleccionado.getFullYear(), this.mesSeleccionado.getMonth() - 5, 1);
      const inicioStr = inicio.toISOString().slice(0, 10);

      const { data, error } = await supabaseClient
        .from("transacciones")
        .select("tipo, monto, fecha")
        .gte("fecha", inicioStr);

      if (error) return;

      const meses = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(this.mesSeleccionado.getFullYear(), this.mesSeleccionado.getMonth() - i, 1);
        meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("es-AR", { month: "short" }), ingresos: 0, gastos: 0 });
      }

      data.forEach(m => {
        const key = m.fecha.slice(0, 7);
        const mes = meses.find(x => x.key === key);
        if (!mes) return;
        if (m.tipo === "ingreso") mes.ingresos += Number(m.monto);
        else mes.gastos += Number(m.monto);
      });

      this.renderChartEvolucion(meses);
    },

    async guardar() {
      this.errorMsg = "";
      if (!this.puedeGuardar) return;

      const { error } = await supabaseClient.from("transacciones").insert({
        tipo: this.tipo,
        categoria: this.categoria,
        detalle: this.detalle || null,
        monto: parseFloat(this.monto)
      });

      if (error) {
        this.errorMsg = "Error al guardar. Intentá de nuevo.";
        return;
      }

      this.categoria = "";
      this.detalle = "";
      this.monto = "";
      this.cargarTodo();
      this.cargarComparacion();
    },

    async eliminar(id) {
      if (!confirm("¿Eliminar este movimiento?")) return;
      const { error } = await supabaseClient.from("transacciones").delete().eq("id", id);
      if (!error) {
        this.cargarTodo();
        this.cargarComparacion();
      }
    },

    formatMonto(n) {
      return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    formatFecha(f) {
      return new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    },

    renderChartCategorias() {
      const gastos = this.movimientos.filter(m => m.tipo === "gasto");
      const porCategoria = {};
      gastos.forEach(g => {
        porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + Number(g.monto);
      });

      const ctx = document.getElementById("chartCategorias");
      if (!ctx) return;
      if (this.chartCategorias) this.chartCategorias.destroy();

      this.chartCategorias = new Chart(ctx, {
        type: "pie",
        data: {
          labels: Object.keys(porCategoria),
          datasets: [{
            data: Object.values(porCategoria),
            backgroundColor: [
              "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
              "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#84cc16", "#14b8a6"
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } }
        }
      });
    },

    renderChartEvolucion(meses) {
      const ctx = document.getElementById("chartEvolucion");
      if (!ctx) return;
      if (this.chartEvolucion) this.chartEvolucion.destroy();

      this.chartEvolucion = new Chart(ctx, {
        type: "bar",
        data: {
          labels: meses.map(m => m.label),
          datasets: [
            { label: "Ingresos", data: meses.map(m => m.ingresos), backgroundColor: "#22c55e", borderRadius: 4 },
            { label: "Gastos", data: meses.map(m => m.gastos), backgroundColor: "#ef4444", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: { y: { beginAtZero: true } }
        }
      });
    },

    // ==================== COMPARATIVO DE MESES ====================

    setCompTipo(t) {
      this.compTipo = t;
      this.compCategoria = "";
      this.cargarComparacion();
    },

    rangoMes(mesInput) {
      const [año, mes] = mesInput.split("-").map(Number);
      const inicio = new Date(año, mes - 1, 1);
      const fin = new Date(año, mes, 1);
      return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
    },

    agruparPorCategoria(filas) {
      const out = {};
      filas.forEach(f => { out[f.categoria] = (out[f.categoria] || 0) + Number(f.monto); });
      return out;
    },

    labelMes(mesInput) {
      if (!mesInput) return "";
      const [año, mes] = mesInput.split("-").map(Number);
      return new Date(año, mes - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    },

    async cargarComparacion() {
      if (!this.compMesA || !this.compMesB) return;

      const rangoA = this.rangoMes(this.compMesA);
      const rangoB = this.rangoMes(this.compMesB);

      let queryA = supabaseClient.from("transacciones").select("categoria, monto")
        .gte("fecha", rangoA.inicio).lt("fecha", rangoA.fin).eq("tipo", this.compTipo);
      let queryB = supabaseClient.from("transacciones").select("categoria, monto")
        .gte("fecha", rangoB.inicio).lt("fecha", rangoB.fin).eq("tipo", this.compTipo);

      if (this.compCategoria) {
        queryA = queryA.eq("categoria", this.compCategoria);
        queryB = queryB.eq("categoria", this.compCategoria);
      }

      const [resA, resB] = await Promise.all([queryA, queryB]);
      if (resA.error || resB.error) return;

      const totalA = resA.data.reduce((s, m) => s + Number(m.monto), 0);
      const totalB = resB.data.reduce((s, m) => s + Number(m.monto), 0);
      const porCategoriaA = this.agruparPorCategoria(resA.data);
      const porCategoriaB = this.agruparPorCategoria(resB.data);
      const categorias = [...new Set([...Object.keys(porCategoriaA), ...Object.keys(porCategoriaB)])];

      this.comparacion = {
        totalA,
        totalB,
        diferencia: totalA - totalB,
        porcentaje: totalB > 0 ? ((totalA - totalB) / totalB) * 100 : null
      };

      this.renderChartComparacion(categorias, porCategoriaA, porCategoriaB);
    },

    renderChartComparacion(categorias, porA, porB) {
      const ctx = document.getElementById("chartComparacion");
      if (!ctx) return;
      if (this.chartComparacion) this.chartComparacion.destroy();

      if (categorias.length === 0) return;

      this.chartComparacion = new Chart(ctx, {
        type: "bar",
        data: {
          labels: categorias,
          datasets: [
            { label: this.labelMes(this.compMesA), data: categorias.map(c => porA[c] || 0), backgroundColor: "#3b82f6", borderRadius: 4 },
            { label: this.labelMes(this.compMesB), data: categorias.map(c => porB[c] || 0), backgroundColor: "#94a3b8", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  };
}
