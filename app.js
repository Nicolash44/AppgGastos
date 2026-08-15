const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIAS = {
  ingreso: ["Sueldo", "Freelance/Changas", "Otros"],
  gasto: ["Mercado", "Nafta", "Mantenimiento Auto", "Servicios", "Vivienda", "Salud", "Seguro", "Tarjeta de Crédito", "Ocio", "Ropa", "Otros"]
};

function loginApp() {
  return {
    session: null,
    email: "",
    password: "",
    errorMsg: "",

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        this.session = session;
      });
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
    }
  };
}

function gastosApp() {
  return {
    session: null,
    tipo: "gasto",
    categoria: "",
    detalle: "",
    monto: "",
    movimientos: [],
    errorMsg: "",
    chartCategorias: null,
    chartEvolucion: null,
    mesSeleccionado: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    get categoriasActuales() {
      return CATEGORIAS[this.tipo];
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

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        if (session) this.cargarTodo();
      });
      if (this.session) this.cargarTodo();
      this.setTipo("gasto");
    },

    setTipo(t) {
      this.tipo = t;
      this.categoria = "";
    },

    async logout() {
      await supabaseClient.auth.signOut();
    },

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
    },

    async eliminar(id) {
      if (!confirm("¿Eliminar este movimiento?")) return;
      const { error } = await supabaseClient.from("transacciones").delete().eq("id", id);
      if (!error) this.cargarTodo();
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
        type: "doughnut",
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
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  };
}
