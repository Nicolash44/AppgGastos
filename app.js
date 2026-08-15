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
    chart: null,

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
    get mesActualLabel() {
      return new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    },

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        if (session) this.cargarMovimientos();
      });
      if (this.session) this.cargarMovimientos();
      this.setTipo("gasto");
    },

    setTipo(t) {
      this.tipo = t;
      this.categoria = "";
    },

    async logout() {
      await supabaseClient.auth.signOut();
    },

    async cargarMovimientos() {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      const inicioStr = inicioMes.toISOString().slice(0, 10);

      const { data, error } = await supabaseClient
        .from("transacciones")
        .select("*")
        .gte("fecha", inicioStr)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });

      if (!error) {
        this.movimientos = data;
        this.renderChart();
      }
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
      this.cargarMovimientos();
    },

    async eliminar(id) {
      if (!confirm("¿Eliminar este movimiento?")) return;
      const { error } = await supabaseClient.from("transacciones").delete().eq("id", id);
      if (!error) this.cargarMovimientos();
    },

    formatMonto(n) {
      return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    formatFecha(f) {
      return new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    },

    renderChart() {
      const gastos = this.movimientos.filter(m => m.tipo === "gasto");
      const porCategoria = {};
      gastos.forEach(g => {
        porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + Number(g.monto);
      });

      const ctx = document.getElementById("chartCategorias");
      if (!ctx) return;
      if (this.chart) this.chart.destroy();

      this.chart = new Chart(ctx, {
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
    }
  };
}
