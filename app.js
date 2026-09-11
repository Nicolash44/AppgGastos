const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado compartido entre loginApp y gastosApp: fuerza la pantalla de "nueva contraseña"
// aunque el link de recuperación ya haya dejado una sesión activa.
document.addEventListener("alpine:init", () => {
  Alpine.store("auth", { recuperando: false });
});

// Se usa una sola vez por usuario nuevo, para poblar su tabla "categorias" en Supabase.
// Una vez sembradas, cada usuario las administra desde la app (agregar/eliminar).
const CATEGORIAS_DEFAULT = {
  ingreso: ["Sueldo", "Freelance/Changas", "Otros"],
  gasto: ["Mercado", "Nafta", "Mantenimiento Auto", "Servicios", "Vivienda", "Salud", "Seguro", "Tarjeta de Crédito", "Ocio", "Ropa", "Otros"]
};

function loginApp() {
  return {
    session: null,
    vista: "landing", // landing | login | registro | recuperar | nueva-contraseña
    email: "",
    password: "",
    password2: "",
    nuevaPassword: "",
    nuevaPassword2: "",
    verPassword: false,
    verPasswordRegistro: false,
    verPasswordNueva: false,
    errorMsg: "",
    infoMsg: "",

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      supabaseClient.auth.onAuthStateChange((event, session) => {
        this.session = session;
        if (event === "PASSWORD_RECOVERY") {
          Alpine.store("auth").recuperando = true;
          this.vista = "nueva-contraseña";
          this.errorMsg = "";
          this.infoMsg = "";
        }
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

    irARecuperar() {
      this.vista = "recuperar";
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

    // Sirve tanto para login como para registro: si el usuario de Google no existe
    // todavía en Supabase Auth, se crea solo (mismo trigger que arma su perfil/trial).
    async continuarConGoogle() {
      this.errorMsg = "";
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) {
        this.errorMsg = "No se pudo iniciar con Google. Intentá de nuevo.";
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
    },

    async enviarRecuperacion() {
      this.errorMsg = "";
      this.infoMsg = "";

      const { error } = await supabaseClient.auth.resetPasswordForEmail(this.email, {
        redirectTo: window.location.origin + window.location.pathname
      });

      if (error) {
        this.errorMsg = "No se pudo enviar el mail. Revisá el email e intentá de nuevo.";
        return;
      }

      this.infoMsg = "Si ese email tiene una cuenta, te mandamos un link para restablecer la contraseña. Revisá (y la carpeta de spam).";
    },

    async actualizarPassword() {
      this.errorMsg = "";

      if (this.nuevaPassword.length < 8) {
        this.errorMsg = "La contraseña tiene que tener al menos 8 caracteres";
        return;
      }
      if (this.nuevaPassword !== this.nuevaPassword2) {
        this.errorMsg = "Las contraseñas no coinciden";
        return;
      }

      const { error } = await supabaseClient.auth.updateUser({ password: this.nuevaPassword });

      if (error) {
        this.errorMsg = "No se pudo actualizar la contraseña. Probá pedir el link de nuevo.";
        return;
      }

      this.infoMsg = "Contraseña actualizada. Ya podés usar la app.";
      this.nuevaPassword = "";
      this.nuevaPassword2 = "";
      Alpine.store("auth").recuperando = false;
      // session ya está activa (la estableció el link de recuperación), la app pasa sola
    }
  };
}

// Reemplazá por tu alias real de Mercado Pago (o CBU/CVU) para recibir transferencias
const ALIAS_PAGO = "ingresos247";
// Tu propio UUID (Authentication → Users), el mismo que usa la función es_admin() en Supabase
const ADMIN_USER_ID = "ee15e501-77cf-4201-b322-331af1337edd";

function gastosApp() {
  return {
    session: null,
    perfil: null, // { trial_inicio, pagado_hasta, pago_solicitado, mp_preapproval_id } | null mientras carga
    aliasPago: ALIAS_PAGO,
    mostrarPago: false,
    mostrarTransferencia: false,
    procesandoMP: false,
    mpInitPoint: null,
    confirmandoSuscripcion: false,
    mostrarGraciasSuscripcion: false,
    mostrarPagoPendiente: false,
    mostrarAdmin: false,
    usuariosAdmin: [],
    tipo: "gasto",
    categoria: "",
    detalle: "",
    monto: "",
    movimientos: [],
    movAEliminar: null,
    errorMsg: "",
    guardando: false,
    cargandoInicial: true,
    toast: null,
    toastTimeout: null,
    chartCategorias: null,
    chartEvolucion: null,
    chartComparacion: null,
    mesSeleccionado: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    // --- categorías por usuario ---
    categorias: { ingreso: [], gasto: [] },
    editandoCategorias: false,
    nuevaCategoria: "",
    limiteInput: "",

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
    // 24hs de gracia desde que avisó "Ya transferí", mientras el admin confirma a mano.
    enGracia() {
      if (!this.perfil || !this.perfil.pago_solicitado) return false;
      const vence = new Date(this.perfil.pago_solicitado);
      vence.setHours(vence.getHours() + 24);
      return vence > new Date();
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
      if (this.pagoVigente() || this.enGracia()) return false;
      return this.diasRestantesTrial === 0;
    },
    get esAdmin() {
      return !!(this.session && this.session.user && this.session.user.id === ADMIN_USER_ID);
    },

    async init() {
      const { data } = await supabaseClient.auth.getSession();
      this.session = data.session;
      if (this.session) this.arrancarUnaVez();

      supabaseClient.auth.onAuthStateChange((_event, session) => {
        const teniaSesion = !!this.session;
        this.session = session;
        if (session && !teniaSesion) this.arrancarUnaVez();
      });

      window.matchMedia("(max-width: 767px)").addEventListener("change", (e) => {
        this.esMobile = e.matches;
      });
    },

    arrancarUnaVez() {
      // onAuthStateChange puede avisar la sesión más de una vez (ej. un evento
      // inicial además del que ya manejamos a mano al arrancar) — sin esta traba,
      // arrancar() podía terminar corriendo dos veces en paralelo, pisándose una
      // a la otra al crear los gráficos (de ahí errores raros e inconsistentes
      // entre dispositivos, tipo "Cannot read properties of null" en Chart.js).
      if (this._arrancando) return;
      this._arrancando = true;
      this.arrancar();
    },

    async arrancar() {
      await this.cargarPerfil();

      // Volvió del checkout de Mercado Pago: el webhook puede tardar unos segundos
      // en acreditar, así que reintentamos un rato antes de mostrar bloqueo.
      // Ojo: MP le pega sus propios parámetros al back_url con un "?" en vez de
      // un "&" (ej. "?suscripcion=pendiente?preapproval_id=..."), así que acá
      // "suscripcion" termina valiendo "pendiente?preapproval_id=..." en vez de
      // "pendiente" a secas — por eso se chequea con startsWith, no con "===".
      const params = new URLSearchParams(window.location.search);
      if (params.get("suscripcion")?.startsWith("pendiente")) {
        window.history.replaceState({}, "", window.location.pathname);

        this.confirmandoSuscripcion = true;
        for (let intento = 0; intento < 5 && !this.pagoVigente(); intento++) {
          await new Promise(r => setTimeout(r, 3000));
          await this.cargarPerfil();
        }
        this.confirmandoSuscripcion = false;
        if (this.pagoVigente()) {
          // Confirmado de verdad: el webhook ya extendió pagado_hasta.
          this.mostrarGraciasSuscripcion = true;
        } else if (!this.bloqueado) {
          // Todavía no se confirmó (puede estar rechazada, o el webhook está
          // tardando más de lo que esperamos) pero como sigue en trial/gracia
          // igual puede seguir usando la app — se lo avisamos sin asegurarle
          // algo que no pasó.
          this.mostrarPagoPendiente = true;
        }
        // Si además está bloqueado (trial vencido y el pago no se confirmó),
        // no hace falta nada especial acá: va a caer en la pantalla normal de
        // "Activar cuenta" de más abajo, donde puede reintentar o transferir.
      }

      if (this.bloqueado) { this.cargandoInicial = false; return; } // no cargar nada más si la cuenta está bloqueada
      await this.cargarDatosApp();
    },

    async cargarDatosApp() {
      this.mostrarComparacion = !this.esMobile;
      await this.cargarCategorias();
      this.setTipo("gasto");

      const hoy = new Date();
      this.compMesA = this.formatMesInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      this.compMesB = this.formatMesInput(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));

      this.cargandoInicial = false;
      await this.cargarTodo();
      await this.cargarComparacion();
    },

    formatMesInput(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    },

    // Filtra lo que se escribe en los campos de monto/límite: solo dígitos y un
    // único punto decimal, para que no se puedan tipear letras.
    soloNumeros(valor) {
      const limpio = (valor || "").replace(/[^0-9.]/g, "");
      const primerPunto = limpio.indexOf(".");
      if (primerPunto === -1) return limpio;
      return limpio.slice(0, primerPunto + 1) + limpio.slice(primerPunto + 1).replace(/\./g, "");
    },

    setTipo(t) {
      this.tipo = t;
      this.categoria = "";
      this.limiteInput = "";
      this.renderChartCategorias();
    },

    async logout() {
      await supabaseClient.auth.signOut();
    },

    async cargarPerfil() {
      const { data, error } = await supabaseClient
        .from("perfiles")
        .select("trial_inicio, pagado_hasta, pago_solicitado, mp_preapproval_id")
        .single();
      if (!error) this.perfil = data;
    },

    async marcarPagoTransferido() {
      const estabaBloqueado = this.bloqueado;
      const { error } = await supabaseClient.rpc("solicitar_pago");
      if (!error) {
        this.perfil = { ...this.perfil, pago_solicitado: new Date().toISOString() };
        // la gracia de 24hs recién ahora lo desbloquea: si no había cargado datos
        // todavía (estaba en la pantalla de bloqueo), hay que cargarlos.
        if (estabaBloqueado && !this.bloqueado) await this.cargarDatosApp();
      }
    },

    async suscribirseConMP() {
      if (this.procesandoMP || this.mpInitPoint) return; // evita doble click / doble pedido
      this.errorMsg = "";
      this.procesandoMP = true;
      try {
        const { data, error } = await supabaseClient.functions.invoke("mp-suscripcion", {
          body: { action: "crear" }
        });
        if (error || !data?.init_point) {
          this.errorMsg = "No se pudo iniciar la suscripción. Intentá de nuevo.";
          return;
        }
        // No redirigimos solos con window.location: algunos navegadores (ej. la
        // protección "Tracking Prevention" de Edge) bloquean una navegación
        // programática que llega después de un fetch async. Mostramos un link real
        // para que el usuario lo clickee — eso ningún navegador lo bloquea.
        this.mpInitPoint = data.init_point;
      } finally {
        this.procesandoMP = false;
      }
    },

    async cancelarSuscripcionMP() {
      if (!confirm("¿Cancelar la suscripción de Mercado Pago? Vas a seguir teniendo acceso hasta que venza lo ya pagado.")) return;
      this.procesandoMP = true;
      try {
        const { data, error } = await supabaseClient.functions.invoke("mp-suscripcion", {
          body: { action: "cancelar" }
        });
        if (error || data?.error) {
          this.errorMsg = "No se pudo cancelar la suscripción. Intentá de nuevo.";
          return;
        }
        this.perfil = { ...this.perfil, mp_preapproval_id: null };
        this.mpInitPoint = null;
      } finally {
        this.procesandoMP = false;
      }
    },

    async copiarAlias() {
      try {
        await navigator.clipboard.writeText(this.aliasPago);
      } catch (e) {
        // si el navegador bloquea el clipboard, no rompe nada, el usuario copia a mano
      }
    },

    // ==================== ADMIN ====================

    async cargarUsuariosAdmin() {
      const { data, error } = await supabaseClient.rpc("admin_listar_usuarios");
      if (!error) this.usuariosAdmin = data;
    },

    abrirAdmin() {
      this.mostrarAdmin = true;
      this.cargarUsuariosAdmin();
    },

    estadoUsuario(u) {
      const ahora = new Date();
      if (u.pagado_hasta && new Date(u.pagado_hasta) > ahora) {
        const dias = Math.ceil((new Date(u.pagado_hasta) - ahora) / 86400000);
        return `Pago vigente · ${dias} día(s)`;
      }
      const venceTrial = new Date(u.trial_inicio);
      venceTrial.setDate(venceTrial.getDate() + 5);
      if (venceTrial > ahora) {
        const dias = Math.ceil((venceTrial - ahora) / 86400000);
        return `Trial · ${dias} día(s)`;
      }
      return "Bloqueado";
    },

    async confirmarPagoAdmin(userId) {
      if (!confirm("¿Confirmar 1 mes de pago para este usuario?")) return;
      const { error } = await supabaseClient.rpc("confirmar_pago", { p_user_id: userId, meses: 1 });
      if (!error) this.cargarUsuariosAdmin();
    },

    async bloquearUsuarioAdmin(userId) {
      if (!confirm("¿Bloquear a este usuario ahora mismo?")) return;
      const { error } = await supabaseClient.rpc("admin_bloquear_usuario", { p_user_id: userId });
      if (!error) this.cargarUsuariosAdmin();
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

    // Crea la categoría y guarda el movimiento en un solo paso: antes había que
    // crear la categoría, esperar a que se seleccione sola y recién ahí cargar
    // el monto — ahora se piden nombre + monto (obligatorio) + límite (opcional,
    // solo gastos) juntos y "Agregar" hace las dos cosas.
    async agregarCategoria() {
      this.errorMsg = "";
      const nombre = this.nuevaCategoria.trim();
      if (!nombre || !this.monto || parseFloat(this.monto) <= 0 || this.guardando) return;

      const yaExiste = this.categorias[this.tipo].some(c => c.nombre.toLowerCase() === nombre.toLowerCase());
      if (yaExiste) {
        this.errorMsg = "Ya existe una categoría con ese nombre.";
        return;
      }

      this.guardando = true;
      try {
        const orden = this.categorias[this.tipo].length;
        const limite = this.tipo === "gasto" && this.limiteInput.trim() !== "" ? parseFloat(this.limiteInput) : null;
        const { error } = await supabaseClient.from("categorias").insert({ tipo: this.tipo, nombre, orden, limite });
        if (error) {
          this.errorMsg = "Error al crear la categoría. Intentá de nuevo.";
          return;
        }

        this.nuevaCategoria = "";
        this.limiteInput = "";
        await this.cargarCategorias();
        this.editandoCategorias = false;
        this.categoria = nombre;
        this.guardando = false;
        await this.guardar();
      } finally {
        this.guardando = false;
      }
    },

    async eliminarCategoria(cat) {
      if (!confirm(`¿Eliminar la categoría "${cat.nombre}"? Los movimientos ya cargados con esta categoría no se modifican.`)) return;
      const { error } = await supabaseClient.from("categorias").delete().eq("id", cat.id);
      if (!error) await this.cargarCategorias();
    },

    seleccionarCategoria(cat) {
      this.categoria = cat.nombre;
      this.limiteInput = cat.limite != null ? String(cat.limite) : "";
    },

    // Límite mensual opcional por categoría de gasto — solo informativo, no bloquea
    // nada. Se guarda apenas se sale del campo (no hace falta un botón aparte).
    async guardarLimite() {
      const cat = this.categorias.gasto.find(c => c.nombre === this.categoria);
      if (!cat) return;

      const valor = this.limiteInput.trim() === "" ? null : parseFloat(this.limiteInput);
      const { error } = await supabaseClient
        .from("categorias")
        .update({ limite: valor })
        .eq("id", cat.id);

      if (!error) cat.limite = valor;
    },

    totalGastadoCategoria(nombre) {
      return this.movimientos
        .filter(m => m.tipo === "gasto" && m.categoria === nombre)
        .reduce((s, m) => s + Number(m.monto), 0);
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
      await Promise.all([this.cargarMovimientos(), this.cargarEvolucion()]);
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
      if (!this.puedeGuardar || this.guardando) return;
      this.guardando = true;

      try {
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
        await Promise.all([this.cargarTodo(), this.cargarComparacion()]);
      } finally {
        this.guardando = false;
      }
    },

    confirmarEliminar(mov) {
      this.movAEliminar = mov;
    },

    async eliminarConfirmado() {
      const mov = this.movAEliminar;
      this.movAEliminar = null;
      if (mov) await this.eliminar(mov);
    },

    async eliminar(mov) {
      const { error } = await supabaseClient.from("transacciones").delete().eq("id", mov.id);
      if (error) return;

      this.movimientos = this.movimientos.filter(m => m.id !== mov.id);
      this.renderChartCategorias();
      this.cargarEvolucion();
      this.cargarComparacion();

      this.mostrarToast("Movimiento eliminado", async () => {
        await supabaseClient.from("transacciones").insert({
          tipo: mov.tipo,
          categoria: mov.categoria,
          detalle: mov.detalle,
          monto: mov.monto,
          fecha: mov.fecha
        });
        await Promise.all([this.cargarTodo(), this.cargarComparacion()]);
      });
    },

    mostrarToast(msg, onDeshacer) {
      clearTimeout(this.toastTimeout);
      const id = Date.now();
      this.toast = { id, msg, onDeshacer };
      this.toastTimeout = setTimeout(() => {
        if (this.toast && this.toast.id === id) this.toast = null;
      }, 5000);
    },

    async deshacerToast() {
      if (!this.toast || !this.toast.onDeshacer) return;
      const accion = this.toast.onDeshacer;
      clearTimeout(this.toastTimeout);
      this.toast = null;
      await accion();
    },

    formatMonto(n) {
      return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    formatFecha(f) {
      return new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    },

    renderChartCategorias() {
      const movs = this.movimientos.filter(m => m.tipo === this.tipo);
      const porCategoria = {};
      movs.forEach(g => {
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
              "#e11d48", "#f97316", "#eab308", "#059669", "#06b6d4",
              "#0ea5e9", "#8b5cf6", "#ec4899", "#64748b", "#84cc16", "#14b8a6"
            ],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          animation: false,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 14, boxHeight: 14, padding: 14, font: { size: 13, weight: "500" }, color: "#334155" } } }
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
            { label: "Ingresos", data: meses.map(m => m.ingresos), backgroundColor: "#059669", borderRadius: 4 },
            { label: "Gastos", data: meses.map(m => m.gastos), backgroundColor: "#e11d48", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          animation: false,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 14, boxHeight: 14, padding: 14, font: { size: 13, weight: "500" }, color: "#334155" } } },
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

      if (categorias.length === 0 || !this.mostrarComparacion) return;

      this.chartComparacion = new Chart(ctx, {
        type: "bar",
        data: {
          labels: categorias,
          datasets: [
            { label: this.labelMes(this.compMesA), data: categorias.map(c => porA[c] || 0), backgroundColor: "#0F172A", borderRadius: 4 },
            { label: this.labelMes(this.compMesB), data: categorias.map(c => porB[c] || 0), backgroundColor: "#94a3b8", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          animation: false,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 14, boxHeight: 14, padding: 14, font: { size: 13, weight: "500" }, color: "#334155" } } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  };
}
