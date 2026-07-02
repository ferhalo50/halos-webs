/*
  HALOSWEBS - AJUSTES RÁPIDOS
  1) Cambia el WhatsApp usando sólo números, con código de país.
  2) Cambia el correo.
  3) Cambia/añade proyectos en la sección "portfolio".
  4) Guarda las capturas de proyectos dentro de /img y coloca su nombre en "image".
  5) Para tu foto personal, agrega el archivo dentro de /img y actualiza su nombre en index.html.
*/
const siteConfig = {
  businessName: "HalosWebs",
  whatsapp: "526645813245", // EJEMPLO: 526641234567 (sin +, espacios ni guiones)
  email: "ferhalo50@hotmail.com",
  defaultWhatsappMessage: "Hola, vi tu página de HalosWebs y me gustaría cotizar una página web para mi negocio.",
  portfolio: [
    {
      title: "Sparrows Gate Mission",
      typeEs: "Sitio institucional bilingüe",
      typeEn: "Bilingual organization website",
      url: "https://ferhalo50.github.io/sparrows-gate-mission/",
      image: "img/sparrows-gate.jpg" // Añade, por ejemplo: "img/sparrows-gate.jpg"
    },
    {
      title: "Casa Lobos",
      typeEs: "Página para propiedad / renta",
      typeEn: "Property / rental website",
      url: "https://ferhalo50.github.io/TerrenoCasaLobos/",
      image: "img/casa-lobos.jpg" // Añade, por ejemplo: "img/casa-lobos.jpg"
    },
    {
      title: "Massage & Facial Care",
      typeEs: "Sitio para spa y servicios",
      typeEn: "Spa and services website",
      url: "https://massagefacialcare.com",
      image: "img/massage-facial-care.jpg" // Añade, por ejemplo: "img/massage-facial-care.jpg"
    },
    {
      title: "DecoMania Rentas",
      typeEs: "Catálogo para renta de eventos",
      typeEn: "Event rental catalogue",
      url: "https://ferhalo50.github.io/deco-mania-renta/",
      image: "img/decomania.jpg" // Añade, por ejemplo: "img/decomania.jpg"
    }
  ]
};

const translations = {
  es: {
    navHome: "Inicio", navServices: "Servicios", navPlans: "Planes", navPortfolio: "Portafolio", navAbout: "Conóceme", navProcess: "Proceso", navContact: "Contacto", navCta: "Cotizar proyecto",
    heroEyebrow: "DISEÑO WEB PARA NEGOCIOS QUE QUIEREN CRECER",
    heroTitle: "Dale a tu negocio una <em>presencia digital</em> que se vea profesional.",
    heroLead: "Creamos páginas web modernas, rápidas y personalizadas para que tus clientes te encuentren, confíen en tu negocio y se pongan en contacto contigo.",
    heroPrimary: "Ver niveles de página", heroSecondary: "Ver mi trabajo", pillOne: "Diseño a tu medida", pillTwo: "Adaptado a celular", pillThree: "Atención directa", pillFour: "Opción bilingüe ES / EN",
    floatOneTitle: "Más visibilidad", floatOneText: "para tu negocio", floatTwoTitle: "Diseño profesional", floatTwoText: "hecho para ti", trustText: "Ideal para negocios locales, emprendedores, profesionistas y empresas.",
    aboutEyebrow: "CONÓCEME", aboutTitle: "Tecnología y soluciones <em>hechas con propósito.</em>", aboutLead: "Hola, soy Fernando. Soy Ingeniero en Sistemas Computacionales y Técnico en Programación. Diseño y desarrollo páginas web y sistemas, administro servidores con usuarios y bases de datos MySQL, y doy mantenimiento a equipos tanto en hardware como software.", aboutFocusOne: "Páginas web y sistemas", aboutFocusTwo: "Servidores, usuarios y MySQL", aboutFocusThree: "Mantenimiento de hardware y software", aboutRole: "Soluciones digitales y soporte técnico", aboutAvailability: "¿Tienes una idea o necesitas apoyo técnico? Cuéntame en qué puedo ayudarte.", aboutCtaWhatsapp: "Contactarme por WhatsApp", aboutCtaEmail: "Escribirme por correo",
    introEyebrow: "NO SOLO UNA PÁGINA BONITA", introText: "Tu sitio debe explicar lo que haces, mostrar por qué elegirte y convertir visitas en <strong>clientes potenciales.</strong>",
    servicesEyebrow: "LO QUE RECIBE TU NEGOCIO", servicesTitle: "Una página pensada para <em>trabajar por ti.</em>", servicesLead: "Cada proyecto se adapta a lo que necesita tu negocio, sin plantillas genéricas ni procesos confusos.",
    featureOneTitle: "Diseño con identidad", featureOneText: "Colores, estilo, secciones y contenido alineados a la imagen de tu marca.",
    featureTwoTitle: "Perfecta en celular", featureTwoText: "Tu página se adapta de forma limpia a teléfonos, tablets y computadoras.",
    featureThreeTitle: "Contacto fácil", featureThreeText: "Botones de WhatsApp, correo, mapas, redes sociales y llamados claros a la acción.",
    featureFourTitle: "Listo para crecer", featureFourText: "Tu sitio puede evolucionar con nuevas secciones, galerías, productos o funciones.",
    plansEyebrow: "ELIGE EL NIVEL IDEAL", plansTitle: "Tu página, al nivel que <em>tu negocio necesita.</em>", plansLead: "Precios de desarrollo desde. El costo final depende del contenido, las funciones y la complejidad de tu proyecto.",
    planPriceLabel: "Desarrollo web desde", planPriceNote: "Pago único por desarrollo", planOnePrice: "$5,500 MXN", planTwoPrice: "$10,500 MXN", planThreePrice: "$18,000 MXN",
    planOneTag: "Essential", planOneTitle: "Presencia inicial", planOneSummary: "Para presentar tu negocio de forma clara, limpia y profesional.", planOneItem1: "Información general del negocio", planOneItem2: "Servicios, horarios y ubicación", planOneItem3: "Botones de WhatsApp y contacto", planOneItem4: "Diseño sencillo y responsivo", planOneItem5: "Enlaces a redes sociales",
    recommended: "RECOMENDADO", planTwoTag: "Professional", planTwoTitle: "Página personalizada", planTwoSummary: "Para marcas que quieren destacar con una experiencia visual más completa.", planTwoItem1: "Todo lo incluido en Essential", planTwoItem2: "Diseño visual personalizado", planTwoItem3: "Galerías, animaciones y secciones extra", planTwoItem4: "Página bilingüe si la necesitas", planTwoItem5: "Portafolio, reseñas o preguntas frecuentes",
    planThreeTag: "Sales", planThreeTitle: "Tienda o sistema de ventas", planThreeSummary: "Para vender productos o recibir pedidos desde tu propia página.", planThreeItem1: "Todo lo incluido en Professional", planThreeItem2: "Catálogo o tienda en línea", planThreeItem3: "Carrito, pedidos o flujo de compra", planThreeItem4: "Opciones de pago según el proyecto", planThreeItem5: "Funciones y plataforma cotizadas a medida", planCta: "Solicitar cotización",
    hostingTitle: "Hosting y publicación", hostingText: "Los planes Essential y Professional se publican en <strong>Cloudflare Pages</strong> con HTTPS y conexión desde GitHub. Para páginas informativas estándar, no hay una mensualidad adicional de hosting.",
    domainTitle: "Dominio y configuración anual", domainText: "El nombre de tu página, por ejemplo <strong>tunegocio.com</strong>, se registra a tu nombre. Incluye conexión, DNS y HTTPS. Suele costar entre <strong>$510 y $850 MXN al año</strong>, según extensión y disponibilidad.",
    salesPlatformTitle: "Plataforma para ventas", salesPlatformText: "El plan Sales se implementa en una plataforma de comercio como <strong>Tiendanube</strong>, desde <strong>$149 MXN al mes</strong>. La suscripción, comisiones de pago y envíos se contratan por separado.",
    maintenanceTitle: "Mantenimiento opcional", maintenanceText: "Por <strong>$340 MXN al mes</strong>, puedo ayudarte con cambios razonables de contenido, correcciones, actualizaciones y revisión general de la página.", plansFootnote: "Precios base en MXN. El alcance final se confirma antes de iniciar el proyecto.",
    portfolioEyebrow: "PROYECTOS REALES", portfolioTitle: "Mira ejemplos y conoce <em>mi trabajo.</em>", portfolioLead: "Cada página tiene una personalidad distinta, creada alrededor del negocio, su público y sus objetivos.", portfolioNote: "¿Te gustó algún estilo? Podemos tomarlo como referencia y crear uno que sea único para tu marca.", projectVisit: "Ver proyecto",
    processEyebrow: "UN PROCESO CLARO", processTitle: "De la idea a una página <em>lista para compartir.</em>", processLead: "Nos enfocamos en hacer el proceso directo: tú conoces tu negocio y yo convierto esa información en una presencia digital profesional.", processCta: "Hablemos de tu proyecto",
    stepOneTitle: "Platicamos", stepOneText: "Me cuentas qué hace tu negocio, qué necesitas y qué estilo te gustaría transmitir.", stepTwoTitle: "Planeamos", stepTwoText: "Definimos secciones, contenido, funciones y el nivel de página que mejor te conviene.", stepThreeTitle: "Diseñamos", stepThreeText: "Construyo tu sitio con una propuesta visual clara, adaptable a celular y enfocada en tus clientes.", stepFourTitle: "Publicamos", stepFourText: "Revisamos los detalles, conectamos el dominio si aplica y tu página queda lista para compartirse.",
    faqEyebrow: "PREGUNTAS COMUNES", faqTitle: "Todo claro, desde el <em>inicio.</em>", faqLead: "Estas son algunas dudas frecuentes antes de crear una página web.",
    faqOneQuestion: "¿El dominio está incluido?", faqOneAnswer: "El dominio se cobra por separado porque queda registrado a tu nombre. Su costo anual estimado es de $510 a $850 MXN, según el nombre, la extensión y la disponibilidad.", faqTwoQuestion: "¿Puedo pedir cambios después?", faqTwoAnswer: "Sí. Puedes solicitar cambios por proyecto o elegir el mantenimiento mensual de $340 MXN para ajustes razonables, correcciones y revisión general.", faqThreeQuestion: "¿La página se verá bien en celular?", faqThreeAnswer: "Sí. Todas las páginas se desarrollan con diseño responsivo para que se adapten correctamente a teléfonos, tablets y computadoras.", faqFourQuestion: "¿Qué necesito para empezar?", faqFourAnswer: "Lo principal es información de tu negocio: servicios, fotos, logo si ya tienes uno, medios de contacto y una idea general de lo que quieres lograr.", faqFiveQuestion: "¿El hosting está incluido?", faqFiveAnswer: "Para Essential y Professional, el hosting estático estándar con Cloudflare Pages y HTTPS se entrega sin una mensualidad adicional. Las tiendas usan una plataforma como Tiendanube, cuya suscripción se paga por separado.",
    contactEyebrow: "HAGAMOS QUE TU NEGOCIO SE VEA EN LÍNEA", contactTitle: "Tu próxima página puede empezar <em>hoy.</em>", contactLead: "Cuéntame qué necesitas y te responderé con una propuesta clara para tu negocio.", contactWhatsapp: "Escribirme por WhatsApp", contactEmailLabel: "O por correo",
    formName: "Tu nombre", formNamePlaceholder: "¿Cómo te llamas?", formBusiness: "Negocio o empresa", formBusinessPlaceholder: "Nombre de tu negocio", formNeed: "¿Qué necesitas?", formOptionOne: "Essential — Presencia inicial", formOptionTwo: "Professional — Página personalizada", formOptionThree: "Sales — Tienda / sistema de ventas", formOptionOther: "No estoy seguro todavía", formMessage: "Cuéntame un poco más", formMessagePlaceholder: "Ej. Quiero mostrar mis servicios y recibir mensajes por WhatsApp.", formSubmit: "Preparar mensaje", formNote: "Al enviarlo se abrirá WhatsApp con tu mensaje listo para mandar.",
    footerText: "Diseño web moderno para negocios que quieren crecer.", backToTop: "Volver arriba ↑", footerRights: "Todos los derechos reservados.", footerBuilt: "Diseñado y desarrollado con atención al detalle.", floatWhatsapp: "¿Hablamos?"
  },
  en: {
    navHome: "Home", navServices: "Services", navPlans: "Plans", navPortfolio: "Portfolio", navAbout: "About me", navProcess: "Process", navContact: "Contact", navCta: "Get a quote",
    heroEyebrow: "WEB DESIGN FOR BUSINESSES READY TO GROW",
    heroTitle: "Give your business a <em>digital presence</em> that looks professional.",
    heroLead: "We create modern, fast and custom websites that help customers find you, trust your business and get in touch.",
    heroPrimary: "Explore website levels", heroSecondary: "See my work", pillOne: "Made for your brand", pillTwo: "Mobile friendly", pillThree: "Direct support", pillFour: "Bilingual option ES / EN",
    floatOneTitle: "More visibility", floatOneText: "for your business", floatTwoTitle: "Professional design", floatTwoText: "made for you", trustText: "Ideal for local businesses, entrepreneurs, professionals and companies.",
    aboutEyebrow: "ABOUT ME", aboutTitle: "Technology and solutions <em>built with purpose.</em>", aboutLead: "Hello, I am Fernando. I am a Computer Systems Engineer and Programming Technician. I design and develop websites and systems, administer servers with users and MySQL databases, and provide computer maintenance for both hardware and software.", aboutFocusOne: "Websites and systems", aboutFocusTwo: "Servers, users and MySQL", aboutFocusThree: "Hardware and software maintenance", aboutRole: "Digital solutions and technical support", aboutAvailability: "Do you have an idea or need technical support? Tell me how I can help.", aboutCtaWhatsapp: "Message me on WhatsApp", aboutCtaEmail: "Send me an email",
    introEyebrow: "MORE THAN A BEAUTIFUL WEBSITE", introText: "Your site should explain what you do, show why clients should choose you and turn visitors into <strong>potential customers.</strong>",
    servicesEyebrow: "WHAT YOUR BUSINESS GETS", servicesTitle: "A website built to <em>work for you.</em>", servicesLead: "Every project is tailored to what your business needs, without generic templates or confusing steps.",
    featureOneTitle: "Design with identity", featureOneText: "Colors, style, sections and content aligned with your brand's image.",
    featureTwoTitle: "Great on mobile", featureTwoText: "Your website adapts cleanly to phones, tablets and computers.",
    featureThreeTitle: "Easy contact", featureThreeText: "WhatsApp, email, maps, social media and clear calls to action.",
    featureFourTitle: "Ready to grow", featureFourText: "Your site can evolve with new sections, galleries, products or features.",
    plansEyebrow: "CHOOSE THE RIGHT LEVEL", plansTitle: "Your website, at the level <em>your business needs.</em>", plansLead: "Starting development prices. The final cost depends on your content, features and project complexity.",
    planPriceLabel: "Website development from", planPriceNote: "One-time development fee", planOnePrice: "US$325", planTwoPrice: "US$620", planThreePrice: "US$1,060",
    planOneTag: "Essential", planOneTitle: "First online presence", planOneSummary: "A clean and professional way to introduce your business.", planOneItem1: "Core business information", planOneItem2: "Services, hours and location", planOneItem3: "WhatsApp and contact buttons", planOneItem4: "Simple responsive design", planOneItem5: "Social media links",
    recommended: "RECOMMENDED", planTwoTag: "Professional", planTwoTitle: "Custom website", planTwoSummary: "For brands that want to stand out with a fuller visual experience.", planTwoItem1: "Everything from Essential", planTwoItem2: "Custom visual design", planTwoItem3: "Galleries, animations and extra sections", planTwoItem4: "Bilingual website if needed", planTwoItem5: "Portfolio, reviews or FAQ section",
    planThreeTag: "Sales", planThreeTitle: "Store or sales system", planThreeSummary: "For selling products or receiving orders from your own website.", planThreeItem1: "Everything from Professional", planThreeItem2: "Online catalogue or store", planThreeItem3: "Cart, orders or checkout flow", planThreeItem4: "Payment options based on project needs", planThreeItem5: "Custom platform and features quoted to fit your project", planCta: "Request a quote",
    hostingTitle: "Hosting and publication", hostingText: "Essential and Professional sites are published on <strong>Cloudflare Pages</strong> with HTTPS and GitHub-based deployment. Standard informational websites do not have an additional monthly hosting fee.",
    domainTitle: "Domain and annual setup", domainText: "Your website name, for example <strong>yourbusiness.com</strong>, is registered in your name. It includes connection, DNS and HTTPS. It typically costs <strong>US$30 to US$50 per year</strong>, depending on the extension and availability.",
    salesPlatformTitle: "Sales platform", salesPlatformText: "The Sales plan runs on a commerce platform such as <strong>Tiendanube</strong>, from <strong>US$9 per month</strong>. Its subscription, payment fees and shipping are billed separately.",
    maintenanceTitle: "Optional maintenance", maintenanceText: "For <strong>US$20 per month</strong>, I can help with reasonable content changes, fixes, updates and general website review.", plansFootnote: "USD prices use an estimated exchange rate of MX$17 = US$1 and are rounded for readability. The final quote is confirmed before work starts.",
    portfolioEyebrow: "REAL PROJECTS", portfolioTitle: "See examples and explore <em>my work.</em>", portfolioLead: "Every website has a different personality, built around the business, its audience and its goals.", portfolioNote: "Did you like a particular style? We can use it as a reference and create something unique for your brand.", projectVisit: "View project",
    processEyebrow: "A CLEAR PROCESS", processTitle: "From an idea to a website <em>ready to share.</em>", processLead: "We keep the process direct: you know your business and I turn that information into a professional digital presence.", processCta: "Let's discuss your project",
    stepOneTitle: "We talk", stepOneText: "You tell me what your business does, what you need and the style you would like to communicate.", stepTwoTitle: "We plan", stepTwoText: "We define sections, content, features and the website level that fits you best.", stepThreeTitle: "We design", stepThreeText: "I build your site with a clear visual direction, adapted for mobile and focused on your customers.", stepFourTitle: "We publish", stepFourText: "We review the details, connect your domain when needed and your site is ready to share.",
    faqEyebrow: "COMMON QUESTIONS", faqTitle: "Everything clear, from the <em>start.</em>", faqLead: "Here are a few common questions before building a website.",
    faqOneQuestion: "Is the domain included?", faqOneAnswer: "The domain is billed separately because it is registered in your name. Its estimated yearly cost is US$30 to US$50, depending on the name, extension and availability.", faqTwoQuestion: "Can I request changes later?", faqTwoAnswer: "Yes. You can request project-based changes or choose the US$20 monthly maintenance for reasonable adjustments, fixes and general review.", faqThreeQuestion: "Will the site look good on a phone?", faqThreeAnswer: "Yes. Every website is built responsively so it adapts properly to phones, tablets and computers.", faqFourQuestion: "What do I need to start?", faqFourAnswer: "Mainly business information: services, photos, logo if you already have one, contact details and a general idea of what you want to achieve.", faqFiveQuestion: "Is hosting included?", faqFiveAnswer: "For Essential and Professional, standard static hosting with Cloudflare Pages and HTTPS is included with no extra monthly fee. Stores use a platform such as Tiendanube, whose subscription is billed separately.",
    contactEyebrow: "LET'S PUT YOUR BUSINESS ONLINE", contactTitle: "Your next website can start <em>today.</em>", contactLead: "Tell me what you need and I will reply with a clear proposal for your business.", contactWhatsapp: "Message me on WhatsApp", contactEmailLabel: "Or by email",
    formName: "Your name", formNamePlaceholder: "What is your name?", formBusiness: "Business or company", formBusinessPlaceholder: "Your business name", formNeed: "What do you need?", formOptionOne: "Essential — First online presence", formOptionTwo: "Professional — Custom website", formOptionThree: "Sales — Store / sales system", formOptionOther: "I'm not sure yet", formMessage: "Tell me a little more", formMessagePlaceholder: "Ex. I want to show my services and receive WhatsApp messages.", formSubmit: "Prepare message", formNote: "When submitted, WhatsApp will open with your message ready to send.",
    footerText: "Modern web design for businesses ready to grow.", backToTop: "Back to top ↑", footerRights: "All rights reserved.", footerBuilt: "Designed and developed with attention to detail.", floatWhatsapp: "Let's talk"
  }
};

let currentLanguage = localStorage.getItem("haloswebsLanguage") || "es";

const getWhatsappUrl = (message = siteConfig.defaultWhatsappMessage) =>
  `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message)}`;

function getGeneralWhatsappUrl() {
  const message = currentLanguage === "es"
    ? "Hola Fernando, vi tu perfil en HalosWebs y necesito ayuda con:\n\n"
    : "Hello Fernando, I saw your profile on HalosWebs and I need help with:\n\n";

  return getWhatsappUrl(message);
}

function getEmailQuoteUrl() {
  const isSpanish = currentLanguage === "es";
  const subject = isSpanish
    ? "Interesado en cotizar una página web | HalosWebs"
    : "Interested in a website quote | HalosWebs";
  const body = isSpanish
    ? `Hola Fernando,

Vi la página de HalosWebs y me interesa cotizar una página web para mi negocio.

Nombre:
Negocio o empresa:
Tipo de página que necesito:
Mensaje:

Gracias.`
    : `Hello Fernando,

I visited HalosWebs and I am interested in getting a quote for a website for my business.

Name:
Business or company:
Website type I need:
Message:

Thank you.`;

  return `mailto:${siteConfig.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function getEmailServicesUrl() {
  const isSpanish = currentLanguage === "es";
  const subject = isSpanish
    ? "Consulta de servicios tecnológicos | HalosWebs"
    : "Technology services inquiry | HalosWebs";
  const body = isSpanish
    ? `Hola Fernando,

Vi tu perfil en HalosWebs y necesito ayuda con:

Servicio o idea que tengo:

Detalles:

Gracias.`
    : `Hello Fernando,

I saw your profile on HalosWebs and I need help with:

Service or idea I have:

Details:

Thank you.`;

  return `mailto:${siteConfig.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function renderPortfolio() {
  const portfolioGrid = document.getElementById("portfolio-grid");
  if (!portfolioGrid) return;

  portfolioGrid.innerHTML = siteConfig.portfolio.map((project) => {
    const type = currentLanguage === "es" ? project.typeEs : project.typeEn;
    const safeUrl = project.url || "#";
    return `
      <a class="project-card reveal is-visible" href="${safeUrl}" target="${safeUrl !== "#" ? "_blank" : "_self"}" rel="noopener" aria-label="${translations[currentLanguage].projectVisit}: ${project.title}">
        <span class="project-card__fallback" aria-hidden="true"></span>
        ${project.image ? `<img class="project-card__image" src="${project.image}" alt="Vista previa de ${project.title}" loading="lazy" onerror="this.style.display='none'">` : ""}
        <span class="project-card__content">
          <span>
            <small class="project-card__type">${type}</small>
            <h3>${project.title}</h3>
          </span>
          <span class="project-card__arrow" aria-hidden="true">↗</span>
        </span>
      </a>`;
  }).join("");
}

function applyLanguage(language) {
  currentLanguage = language;
  const dictionary = translations[language];
  document.documentElement.lang = language;
  document.title = language === "es" ? "HalosWebs | Páginas web profesionales" : "HalosWebs | Professional websites";

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (dictionary[key]) element.textContent = dictionary[key];
  });

  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    const key = element.dataset.i18nHtml;
    if (dictionary[key]) element.innerHTML = dictionary[key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (dictionary[key]) element.placeholder = dictionary[key];
  });

  document.querySelectorAll(".language-toggle__current").forEach((el) => el.textContent = language.toUpperCase());
  document.querySelectorAll(".language-toggle__other").forEach((el) => el.textContent = language === "es" ? "EN" : "ES");
  document.querySelector(".language-toggle")?.setAttribute("aria-label", language === "es" ? "Switch to English" : "Cambiar a español");
  document.querySelector(".menu-toggle")?.setAttribute("aria-label", language === "es" ? "Abrir menú" : "Open menu");
  document.querySelector(".whatsapp-float")?.setAttribute("aria-label", language === "es" ? "Escríbeme por WhatsApp" : "Message me on WhatsApp");

  // Actualiza también el asunto y el mensaje predeterminado del correo al cambiar de idioma.
  setContactLinks();
  renderPortfolio();
  localStorage.setItem("haloswebsLanguage", language);
}

function setContactLinks() {
  document.querySelectorAll(".js-whatsapp-link").forEach((link) => {
    link.href = getWhatsappUrl();
  });

  document.querySelectorAll(".js-email-link").forEach((link) => {
    link.href = getEmailQuoteUrl();
  });

  document.querySelectorAll(".js-services-whatsapp-link").forEach((link) => {
    link.href = getGeneralWhatsappUrl();
  });

  document.querySelectorAll(".js-services-email-link").forEach((link) => {
    link.href = getEmailServicesUrl();
  });

  document.querySelectorAll(".js-email-text").forEach((text) => {
    text.textContent = siteConfig.email;
  });
}

function setupBrandIcons() {
  document.querySelectorAll(".brand-icon").forEach((icon) => {
    const image = icon.querySelector(".brand-icon__image");
    if (!image) return;

    const setReadyState = (isReady) => icon.classList.toggle("brand-icon--ready", isReady);

    if (image.complete) {
      setReadyState(image.naturalWidth > 0);
      return;
    }

    image.addEventListener("load", () => setReadyState(true), { once: true });
    image.addEventListener("error", () => setReadyState(false), { once: true });
  });
}

function setupMobileMenu() {
  const menuToggle = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");
  if (!menuToggle || !mobileMenu) return;

  const closeMenu = () => {
    menuToggle.classList.remove("is-active");
    menuToggle.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.toggle("is-open");
    menuToggle.classList.toggle("is-active", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("menu-open", isOpen);
  });

  mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => { if (window.innerWidth > 970) closeMenu(); });
}

function setupScrollEffects() {
  const header = document.querySelector(".site-header");
  const progress = document.querySelector(".scroll-progress span");
  const sections = [...document.querySelectorAll("main section[id]")];
  const navLinks = [...document.querySelectorAll(".nav-link")];

  const updateScrollUi = () => {
    const scrollTop = window.scrollY;
    const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle("is-scrolled", scrollTop > 8);
    if (progress) progress.style.width = `${pageHeight > 0 ? (scrollTop / pageHeight) * 100 : 0}%`;

    let currentId = "inicio";
    sections.forEach((section) => {
      if (scrollTop >= section.offsetTop - 145) currentId = section.id;
    });
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${currentId}`));
  };

  updateScrollUi();
  window.addEventListener("scroll", updateScrollUi, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add("is-visible"); });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

function setupContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("contact-name").value.trim();
    const business = document.getElementById("contact-business").value.trim();
    const plan = document.getElementById("contact-plan").value;
    const message = document.getElementById("contact-message").value.trim();
    const isSpanish = currentLanguage === "es";

    const text = isSpanish
      ? `Hola, soy ${name || ""}. ${business ? `Tengo el negocio/empresa: ${business}. ` : ""}Me interesa: ${plan}.${message ? `\n\nMás información: ${message}` : ""}`
      : `Hi, I am ${name || ""}. ${business ? `My business/company is: ${business}. ` : ""}I am interested in: ${plan}.${message ? `\n\nMore information: ${message}` : ""}`;

    window.open(getWhatsappUrl(text), "_blank", "noopener");
  });
}

function init() {
  document.getElementById("year").textContent = new Date().getFullYear();
  setupBrandIcons();
  setContactLinks();
  applyLanguage(currentLanguage);
  setupMobileMenu();
  setupScrollEffects();
  setupContactForm();
  document.querySelector(".language-toggle")?.addEventListener("click", () => applyLanguage(currentLanguage === "es" ? "en" : "es"));
}

document.addEventListener("DOMContentLoaded", init);
