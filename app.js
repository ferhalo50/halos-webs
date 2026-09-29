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
  defaultWhatsappMessage: "Hola, vi la página de HalosWebs y me gustaría cotizar una solución digital para mi negocio.",
  portfolio: [
    { title: "Renace Café Shop", typeEs: "Sistema de lealtad · PWA", typeEn: "Loyalty system · PWA", descriptionEs: "Tarjeta digital, QR, sellos y administración.", descriptionEn: "Digital card, QR, stamps and administration.", featuresEs: "QR · Sellos · Clientes · PWA", featuresEn: "QR · Stamps · Customers · PWA", url: "https://renacecafe.haloswebs.com/", image: "img/portfolio-renace.png", kind: "system renace" },
    { title: "MOON Coffee", typeEs: "Sistema de lealtad · PWA", typeEn: "Loyalty system · PWA", descriptionEs: "Experiencia nocturna con tarjeta digital y recompensas.", descriptionEn: "Nighttime experience with a digital card and rewards.", featuresEs: "QR · Sellos · Equipo · Admin", featuresEn: "QR · Stamps · Team · Admin", url: "https://mooncoffee.haloswebs.com/", image: "img/portfolio-moon.png", kind: "system moon" },
    { title: "Santofé", typeEs: "Sistema de lealtad · PWA", typeEn: "Loyalty system · PWA", descriptionEs: "Sellos por café, recompensa y control de pedidos.", descriptionEn: "Per-coffee stamps, rewards and order control.", featuresEs: "QR · Pedidos · Recompensas · PWA", featuresEn: "QR · Orders · Rewards · PWA", url: "https://santofe.haloswebs.com/", image: "img/portfolio-santofe.png", kind: "system santofe" },
    { title: "Renace Café TV", typeEs: "Señalización Digital · TV", typeEn: "Digital Signage · TV", descriptionEs: "Fotos y videos administrados desde el celular para las pantallas del negocio.", descriptionEn: "Photos and videos managed from a phone for business displays.", featuresEs: "Biblioteca · Videos · Pantalla completa", featuresEn: "Library · Video · Full screen", url: "https://renacecafetv.haloswebs.com/", image: "img/portfolio-renace.png", kind: "system tv" },
    { title: "ASD Tijuana", typeEs: "Sitio corporativo bilingüe", typeEn: "Bilingual corporate website", descriptionEs: "Seguridad digital, automatización y energía con una presentación técnica y clara.", descriptionEn: "Digital security, automation and energy with a clear technical presentation.", featuresEs: "Web · ES/EN · Soluciones · Contacto", featuresEn: "Web · ES/EN · Solutions · Contact", url: "https://asdtijuana.com/", image: "img/portfolio-asd.png", kind: "website asd" },
    { title: "Massage & Facial Care", typeEs: "Sitio para spa y servicios", typeEn: "Spa and services website", descriptionEs: "Presencia comercial con identidad y contacto directo.", descriptionEn: "Branded commercial presence with direct contact.", featuresEs: "Web · Responsive · Contacto", featuresEn: "Web · Responsive · Contact", url: "https://massagefacialcare.com", image: "img/massage-facial-care.jpg", kind: "website" },
    { title: "Sparrows Gate Mission", typeEs: "Sitio institucional bilingüe", typeEn: "Bilingual organization website", descriptionEs: "Contenido institucional claro en español e inglés.", descriptionEn: "Clear organization content in Spanish and English.", featuresEs: "Web · ES/EN · Responsive", featuresEn: "Web · ES/EN · Responsive", url: "https://ferhalo50.github.io/sparrows-gate-mission/", image: "img/sparrows-gate.jpg", kind: "website" },
    { title: "DecoMania Rentas", typeEs: "Catálogo para renta de eventos", typeEn: "Event rental catalogue", descriptionEs: "Catálogo visual para presentar productos y recibir consultas.", descriptionEn: "Visual catalogue for products and customer enquiries.", featuresEs: "Catálogo · Galería · Contacto", featuresEn: "Catalogue · Gallery · Contact", url: "https://ferhalo50.github.io/deco-mania-renta/", image: "img/decomania.jpg", kind: "website" }
  ]};

const translations = {
  es: {
    profileName: "Ing. Fernando", footerEmail: "Correo", trustDesign: "DISEÑO", trustGrow: "CRECE",
    preview: "Vista previa de",
    homeLabel: "HalosWebs - Inicio",
    mainNav: "Navegación principal",
    mobileNav: "Navegación móvil",
    benefitsLabel: "Beneficios principales",
    introLabel: "Introducción",
    photoAlt: "Fernando, creador de HalosWebs",
    expertiseLabel: "Servicios y experiencia",
    priceLabel: "Precio desde",
    emailTitle: "Abrir correo con solicitud de cotización preparada",
    languageTitle: "Cambiar a inglés",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    metaDescription: "HalosWebs crea sitios, aplicaciones y sistemas digitales para negocios.",
    socialDescription: "Creamos sitios, aplicaciones y sistemas digitales para negocios.",
    socialImageAlt: "HalosWebs — Tu negocio merece una presencia digital profesional.",
    navHome: "Inicio", navServices: "Servicios", navPlans: "Planes", navPortfolio: "Portafolio", navAbout: "Conóceme", navProcess: "Proceso", navContact: "Contacto", navCta: "Cotizar proyecto",
    heroEyebrow: "TECNOLOGÍA ÚTIL PARA NEGOCIOS QUE QUIEREN CRECER",
    heroTitle: "Soluciones digitales para <em>negocios que quieren avanzar.</em>",
    heroLead: "Diseñamos sitios, aplicaciones y sistemas que simplifican la operación, conectan con tus clientes y hacen crecer tu presencia digital.",
    heroPrimary: "Ver soluciones y planes", heroSecondary: "Ver mi trabajo", pillOne: "Sitios y sistemas", pillTwo: "Apps para celular", pillThree: "Atención directa", pillFour: "Soporte y mantenimiento",
    floatOneTitle: "Más visibilidad", floatOneText: "para tu negocio", floatTwoTitle: "Diseño profesional", floatTwoText: "hecho para ti", trustText: "Ideal para negocios locales, emprendedores, profesionistas y empresas.",
    aboutEyebrow: "CONÓCEME", aboutTitle: "Tecnología y soluciones <em>hechas con propósito.</em>", aboutLead: "Hola, soy Fernando. Soy Ingeniero en Sistemas Computacionales y Técnico en Programación. Diseño y desarrollo páginas web y sistemas, administro servidores con usuarios y bases de datos MySQL, y doy mantenimiento a equipos tanto en hardware como software.", aboutFocusOne: "Páginas web y sistemas", aboutFocusTwo: "Servidores, usuarios y MySQL", aboutFocusThree: "Mantenimiento de hardware y software", aboutRole: "Soluciones digitales y soporte técnico", aboutAvailability: "¿Tienes una idea o necesitas apoyo técnico? Cuéntame en qué puedo ayudarte.", aboutCtaWhatsapp: "Contactarme por WhatsApp", aboutCtaEmail: "Escribirme por correo",
    introEyebrow: "MÁS QUE UNA PÁGINA WEB", introText: "Creamos herramientas digitales que presentan tu marca, fidelizan clientes y ayudan a operar tu negocio <strong>con claridad.</strong>",
    servicesEyebrow: "UN ECOSISTEMA PARA TU NEGOCIO", servicesTitle: "Tecnología diseñada para <em>resolver y crecer.</em>", servicesLead: "Sitios web, sistemas de lealtad, señalización digital y soluciones personalizadas con una sola dirección clara.",
    featureOneTitle: "Sitios web", featureOneText: "Presencia profesional, rápida, responsiva y alineada con la identidad de tu marca.",
    featureTwoTitle: "Sistemas web", featureTwoText: "Aplicaciones para clientes, equipo y administración que funcionan desde cualquier dispositivo.",
    featureThreeTitle: "Lealtad y PWA", featureThreeText: "Tarjetas digitales, QR, sellos, recompensas y control de clientes sin instalar desde una tienda.",
    featureFourTitle: "Señalización Digital", featureFourText: "Contenido para pantallas del negocio, administrado desde el celular con fotos, videos y biblioteca.",
    plansEyebrow: "PLANES MENSUALES CLAROS", plansTitle: "Tu presencia digital, con <em>soporte continuo.</em>", plansLead: "Elige una base mensual. Funciones grandes, integraciones especiales o proyectos fuera del alcance se evalúan aparte.",
    planPriceLabel: "Desde", planPriceNote: "MXN / mes", planOnePrice: "$599 MXN", planTwoPrice: "$999 MXN", planThreePrice: "$1,499 MXN",
    planOneTag: "Esencial", planOneTitle: "Sitio esencial", planOneSummary: "Para negocios pequeños que necesitan una presencia clara y confiable.", planOneItem1: "Landing o sitio sencillo", planOneItem2: "Diseño responsivo", planOneItem3: "Hosting y SSL", planOneItem4: "Mantenimiento incluido", planOneItem5: "Cambios pequeños razonables",
    recommended: "RECOMENDADO", planTwoTag: "Profesional", planTwoTitle: "Sitio profesional", planTwoSummary: "Para marcas que requieren más contenido, personalización y funciones.", planTwoItem1: "Varias secciones", planTwoItem2: "Diseño más personalizado", planTwoItem3: "Formularios y funciones adicionales", planTwoItem4: "Mantenimiento y soporte", planTwoItem5: "Cambios razonables incluidos",
    planThreeTag: "Negocio", planThreeTitle: "Solución para negocio", planThreeSummary: "Para proyectos web más completos con atención y mantenimiento mayores.", planThreeItem1: "Proyecto web completo", planThreeItem2: "Funciones avanzadas", planThreeItem3: "Integraciones razonables", planThreeItem4: "Atención prioritaria", planThreeItem5: "Alcance especial cotizado aparte", planCta: "Solicitar cotización",
    hostingTitle: "Hosting y publicación", hostingText: "Los planes Essential y Professional se publican en <strong>Cloudflare Pages</strong> con HTTPS y conexión desde GitHub. Para páginas informativas estándar, no hay una mensualidad adicional de hosting.",
    domainTitle: "Dominio y configuración anual", domainText: "El nombre de tu página, por ejemplo <strong>tunegocio.com</strong>, se registra a tu nombre. Incluye conexión, DNS y HTTPS. Suele costar entre <strong>$510 y $850 MXN al año</strong>, según extensión y disponibilidad.",
    salesPlatformTitle: "Plataforma para ventas", salesPlatformText: "El plan Sales se implementa en una plataforma de comercio como <strong>Tiendanube</strong>, desde <strong>$149 MXN al mes</strong>. La suscripción, comisiones de pago y envíos se contratan por separado.",
    maintenanceTitle: "Mantenimiento opcional", maintenanceText: "Por <strong>$340 MXN al mes</strong>, puedo ayudarte con cambios razonables de contenido, correcciones, actualizaciones y revisión general de la página.", plansFootnote: "Precios base en MXN. El alcance final se confirma antes de iniciar el proyecto.",
    systemsPricingEyebrow: "SISTEMAS PARA TU OPERACIÓN", systemsPricingTitle: "Herramientas listas para <em>trabajar todos los días.</em>", loyaltyPlanEyebrow: "SISTEMA DE LEALTAD", loyaltyPlanTitle: "Clientes que regresan", loyaltyPlanText: "Tarjeta digital, QR individual, sellos, recompensas, clientes, empleados, administración, PWA, soporte y mantenimiento.", signagePlanEyebrow: "SEÑALIZACIÓN DIGITAL / TV", signagePlanTitle: "Contenido siempre vigente", signagePlanText: "Administra fotos y videos desde el celular, ordena tu biblioteca y actualiza la pantalla del negocio con soporte y mantenimiento.", monthlySuffix: "/ mes",
    portfolioEyebrow: "SISTEMAS Y PROYECTOS REALES", portfolioTitle: "Soluciones que ya trabajan <em>en negocios reales.</em>", portfolioLead: "Sistemas de lealtad, señalización digital y sitios con una identidad propia, construidos alrededor de cada operación.", portfolioNote: "¿Te gustó algún estilo? Podemos tomarlo como referencia y crear uno que sea único para tu marca.", projectVisit: "Ver proyecto",
    processEyebrow: "UN PROCESO CLARO", processTitle: "De la idea a una página <em>lista para compartir.</em>", processLead: "Nos enfocamos en hacer el proceso directo: tú conoces tu negocio y yo convierto esa información en una presencia digital profesional.", processCta: "Hablemos de tu proyecto",
    stepOneTitle: "Platicamos", stepOneText: "Me cuentas qué hace tu negocio, qué necesitas y qué estilo te gustaría transmitir.", stepTwoTitle: "Planeamos", stepTwoText: "Definimos secciones, contenido, funciones y el nivel de página que mejor te conviene.", stepThreeTitle: "Diseñamos", stepThreeText: "Construyo tu sitio con una propuesta visual clara, adaptable a celular y enfocada en tus clientes.", stepFourTitle: "Publicamos", stepFourText: "Revisamos los detalles, conectamos el dominio si aplica y tu página queda lista para compartirse.",
    faqEyebrow: "PREGUNTAS COMUNES", faqTitle: "Todo claro, desde el <em>inicio.</em>", faqLead: "Estas son algunas dudas frecuentes antes de crear una página web.",
    faqOneQuestion: "¿El dominio está incluido?", faqOneAnswer: "El dominio se cobra por separado porque queda registrado a tu nombre. Su costo anual estimado es de $510 a $850 MXN, según el nombre, la extensión y la disponibilidad.", faqTwoQuestion: "¿Puedo pedir cambios después?", faqTwoAnswer: "Sí. Puedes solicitar cambios por proyecto o elegir el mantenimiento mensual de $340 MXN para ajustes razonables, correcciones y revisión general.", faqThreeQuestion: "¿La página se verá bien en celular?", faqThreeAnswer: "Sí. Todas las páginas se desarrollan con diseño responsivo para que se adapten correctamente a teléfonos, tablets y computadoras.", faqFourQuestion: "¿Qué necesito para empezar?", faqFourAnswer: "Lo principal es información de tu negocio: servicios, fotos, logo si ya tienes uno, medios de contacto y una idea general de lo que quieres lograr.", faqFiveQuestion: "¿El hosting está incluido?", faqFiveAnswer: "Para Essential y Professional, el hosting estático estándar con Cloudflare Pages y HTTPS se entrega sin una mensualidad adicional. Las tiendas usan una plataforma como Tiendanube, cuya suscripción se paga por separado.",
    contactEyebrow: "HAGAMOS QUE TU NEGOCIO SE VEA EN LÍNEA", contactTitle: "Tu próxima página puede empezar <em>hoy.</em>", contactLead: "Cuéntame qué necesitas y te responderé con una propuesta clara para tu negocio.", contactWhatsapp: "Escribirme por WhatsApp", contactEmailLabel: "O por correo",
    formName: "Tu nombre", formNamePlaceholder: "¿Cómo te llamas?", formBusiness: "Negocio o empresa", formBusinessPlaceholder: "Nombre de tu negocio", formNeed: "¿Qué necesitas?", formOptionOne: "Essential — Presencia inicial", formOptionTwo: "Professional — Página personalizada", formOptionThree: "Sales — Tienda / sistema de ventas", formOptionOther: "No estoy seguro todavía", formMessage: "Cuéntame un poco más", formMessagePlaceholder: "Ej. Quiero mostrar mis servicios y recibir mensajes por WhatsApp.", formSubmit: "Preparar mensaje", formNote: "Al enviarlo se abrirá WhatsApp con tu mensaje listo para mandar.",
    footerText: "Soluciones digitales para negocios que quieren crecer.", backToTop: "Volver arriba ↑", footerRights: "Todos los derechos reservados.", footerBuilt: "Diseñado y desarrollado con atención al detalle.", floatWhatsapp: "¿Hablamos?"
  },
  en: {
    profileName: "Fernando · Engineer", footerEmail: "Email", trustDesign: "DESIGN", trustGrow: "GROW",
    preview: "Preview of",
    homeLabel: "HalosWebs - Home",
    mainNav: "Main navigation",
    mobileNav: "Mobile navigation",
    benefitsLabel: "Key benefits",
    introLabel: "Introduction",
    photoAlt: "Fernando, creator of HalosWebs",
    expertiseLabel: "Services and experience",
    priceLabel: "Starting price",
    emailTitle: "Open email with a prepared quote request",
    languageTitle: "Switch to Spanish",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    metaDescription: "HalosWebs builds websites, web apps and digital systems for businesses.",
    socialDescription: "We build websites, web apps and digital systems for businesses.",
    socialImageAlt: "HalosWebs — Your business deserves a professional digital presence.",
    navHome: "Home", navServices: "Services", navPlans: "Plans", navPortfolio: "Portfolio", navAbout: "About me", navProcess: "Process", navContact: "Contact", navCta: "Get a quote",
    heroEyebrow: "USEFUL TECHNOLOGY FOR BUSINESSES READY TO GROW",
    heroTitle: "Digital solutions for <em>businesses ready to move forward.</em>",
    heroLead: "We design websites, apps and systems that simplify operations, connect with customers and grow your digital presence.",
    heroPrimary: "Explore solutions and plans", heroSecondary: "See my work", pillOne: "Made for your brand", pillTwo: "Mobile friendly", pillThree: "Direct support", pillFour: "Bilingual option ES / EN",
    floatOneTitle: "More visibility", floatOneText: "for your business", floatTwoTitle: "Professional design", floatTwoText: "made for you", trustText: "Ideal for local businesses, entrepreneurs, professionals and companies.",
    aboutEyebrow: "ABOUT ME", aboutTitle: "Technology and solutions <em>built with purpose.</em>", aboutLead: "Hello, I am Fernando. I am a Computer Systems Engineer and Programming Technician. I design and develop websites and systems, administer servers with users and MySQL databases, and provide computer maintenance for both hardware and software.", aboutFocusOne: "Websites and systems", aboutFocusTwo: "Servers, users and MySQL", aboutFocusThree: "Hardware and software maintenance", aboutRole: "Digital solutions and technical support", aboutAvailability: "Do you have an idea or need technical support? Tell me how I can help.", aboutCtaWhatsapp: "Message me on WhatsApp", aboutCtaEmail: "Send me an email",
    introEyebrow: "MORE THAN A BEAUTIFUL WEBSITE", introText: "Your site should explain what you do, show why clients should choose you and turn visitors into <strong>potential customers.</strong>",
    servicesEyebrow: "WHAT YOUR BUSINESS GETS", servicesTitle: "A website built to <em>work for you.</em>", servicesLead: "Every project is tailored to what your business needs, without generic templates or confusing steps.",
    featureOneTitle: "Design with identity", featureOneText: "Colors, style, sections and content aligned with your brand's image.",
    featureTwoTitle: "Great on mobile", featureTwoText: "Your website adapts cleanly to phones, tablets and computers.",
    featureThreeTitle: "Easy contact", featureThreeText: "WhatsApp, email, maps, social media and clear calls to action.",
    featureFourTitle: "Ready to grow", featureFourText: "Your site can evolve with new sections, galleries, products or features.",
    plansEyebrow: "CLEAR MONTHLY PLANS", plansTitle: "Your digital presence with <em>ongoing support.</em>", plansLead: "Choose a monthly foundation. Large features, special integrations or work outside the plan are quoted separately.",
    planPriceLabel: "Starting at", planPriceNote: "MXN / month", planOnePrice: "$599 MXN", planTwoPrice: "$999 MXN", planThreePrice: "$1,499 MXN",
    planOneTag: "Essential", planOneTitle: "First online presence", planOneSummary: "A clean and professional way to introduce your business.", planOneItem1: "Core business information", planOneItem2: "Services, hours and location", planOneItem3: "WhatsApp and contact buttons", planOneItem4: "Simple responsive design", planOneItem5: "Social media links",
    recommended: "RECOMMENDED", planTwoTag: "Professional", planTwoTitle: "Custom website", planTwoSummary: "For brands that want to stand out with a fuller visual experience.", planTwoItem1: "Everything from Essential", planTwoItem2: "Custom visual design", planTwoItem3: "Galleries, animations and extra sections", planTwoItem4: "Bilingual website if needed", planTwoItem5: "Portfolio, reviews or FAQ section",
    planThreeTag: "Sales", planThreeTitle: "Store or sales system", planThreeSummary: "For selling products or receiving orders from your own website.", planThreeItem1: "Everything from Professional", planThreeItem2: "Online catalogue or store", planThreeItem3: "Cart, orders or checkout flow", planThreeItem4: "Payment options based on project needs", planThreeItem5: "Custom platform and features quoted to fit your project", planCta: "Request a quote",
    hostingTitle: "Hosting and publication", hostingText: "Essential and Professional sites are published on <strong>Cloudflare Pages</strong> with HTTPS and GitHub-based deployment. Standard informational websites do not have an additional monthly hosting fee.",
    domainTitle: "Domain and annual setup", domainText: "Your website name, for example <strong>yourbusiness.com</strong>, is registered in your name. It includes connection, DNS and HTTPS. It typically costs <strong>US$30 to US$50 per year</strong>, depending on the extension and availability.",
    salesPlatformTitle: "Sales platform", salesPlatformText: "The Sales plan runs on a commerce platform such as <strong>Tiendanube</strong>, from <strong>US$9 per month</strong>. Its subscription, payment fees and shipping are billed separately.",
    maintenanceTitle: "Optional maintenance", maintenanceText: "For <strong>US$20 per month</strong>, I can help with reasonable content changes, fixes, updates and general website review.", plansFootnote: "Base prices in MXN. Final scope is confirmed before the project starts.",
    systemsPricingEyebrow: "SYSTEMS FOR YOUR OPERATION", systemsPricingTitle: "Tools ready to <em>work every day.</em>", loyaltyPlanEyebrow: "LOYALTY SYSTEM", loyaltyPlanTitle: "Customers who return", loyaltyPlanText: "Digital card, individual QR, stamps, rewards, customers, employees, administration, PWA, support and maintenance.", signagePlanEyebrow: "DIGITAL SIGNAGE / TV", signagePlanTitle: "Content that stays current", signagePlanText: "Manage photos and videos from your phone, organize the library and update your business display with support and maintenance.", monthlySuffix: "/ month",
    portfolioEyebrow: "REAL SYSTEMS AND PROJECTS", portfolioTitle: "Solutions already working in <em>real businesses.</em>", portfolioLead: "Loyalty systems, digital signage and websites with their own identity, built around each operation.", portfolioNote: "Did you like a particular style? We can use it as a reference and create something unique for your brand.", projectVisit: "View project",
    processEyebrow: "A CLEAR PROCESS", processTitle: "From an idea to a website <em>ready to share.</em>", processLead: "We keep the process direct: you know your business and I turn that information into a professional digital presence.", processCta: "Let's discuss your project",
    stepOneTitle: "We talk", stepOneText: "You tell me what your business does, what you need and the style you would like to communicate.", stepTwoTitle: "We plan", stepTwoText: "We define sections, content, features and the website level that fits you best.", stepThreeTitle: "We design", stepThreeText: "I build your site with a clear visual direction, adapted for mobile and focused on your customers.", stepFourTitle: "We publish", stepFourText: "We review the details, connect your domain when needed and your site is ready to share.",
    faqEyebrow: "COMMON QUESTIONS", faqTitle: "Everything clear, from the <em>start.</em>", faqLead: "Here are a few common questions before building a website.",
    faqOneQuestion: "Is the domain included?", faqOneAnswer: "The domain is billed separately because it is registered in your name. Its estimated yearly cost is US$30 to US$50, depending on the name, extension and availability.", faqTwoQuestion: "Can I request changes later?", faqTwoAnswer: "Yes. You can request project-based changes or choose the US$20 monthly maintenance for reasonable adjustments, fixes and general review.", faqThreeQuestion: "Will the site look good on a phone?", faqThreeAnswer: "Yes. Every website is built responsively so it adapts properly to phones, tablets and computers.", faqFourQuestion: "What do I need to start?", faqFourAnswer: "Mainly business information: services, photos, logo if you already have one, contact details and a general idea of what you want to achieve.", faqFiveQuestion: "Is hosting included?", faqFiveAnswer: "For Essential and Professional, standard static hosting with Cloudflare Pages and HTTPS is included with no extra monthly fee. Stores use a platform such as Tiendanube, whose subscription is billed separately.",
    contactEyebrow: "LET'S PUT YOUR BUSINESS ONLINE", contactTitle: "Your next website can start <em>today.</em>", contactLead: "Tell me what you need and I will reply with a clear proposal for your business.", contactWhatsapp: "Message me on WhatsApp", contactEmailLabel: "Or by email",
    formName: "Your name", formNamePlaceholder: "What is your name?", formBusiness: "Business or company", formBusinessPlaceholder: "Your business name", formNeed: "What do you need?", formOptionOne: "Essential — First online presence", formOptionTwo: "Professional — Custom website", formOptionThree: "Sales — Store / sales system", formOptionOther: "I'm not sure yet", formMessage: "Tell me a little more", formMessagePlaceholder: "Ex. I want to show my services and receive WhatsApp messages.", formSubmit: "Prepare message", formNote: "When submitted, WhatsApp will open with your message ready to send.",
    footerText: "Digital solutions for businesses ready to grow.", backToTop: "Back to top ↑", footerRights: "All rights reserved.", footerBuilt: "Designed and developed with attention to detail.", floatWhatsapp: "Let's talk"
  }
};

Object.assign(translations.es, {
  hostingTitle: "Hosting, SSL y mantenimiento incluidos",
  hostingText: "Los planes mensuales incluyen publicación, conexión segura y mantenimiento del servicio dentro del alcance acordado.",
  domainTitle: "Dominio a nombre del negocio",
  domainText: "Si necesitas un dominio propio, se registra a tu nombre y su costo anual se confirma según la extensión y disponibilidad.",
  salesPlatformTitle: "Integraciones y funciones especiales",
  salesPlatformText: "Pagos, catálogos complejos, automatizaciones u otras integraciones se revisan y cotizan de acuerdo con el proyecto.",
  maintenanceTitle: "Acompañamiento continuo",
  maintenanceText: "Incluimos soporte y cambios razonables. Nuevas funciones o ampliaciones importantes se evalúan por separado.",
  formOptionOne: "Sitio web mensual",
  formOptionTwo: "Sistema de lealtad",
  formOptionThree: "Señalización Digital / TV",
  formOptionOther: "Solución personalizada / no estoy seguro"
});
Object.assign(translations.en, {
  heroSecondary: "See our work", pillOne: "Websites and systems", pillTwo: "Mobile-ready apps", pillThree: "Direct support", pillFour: "Support and maintenance",
  introEyebrow: "MORE THAN A WEBSITE", introText: "We build digital tools that present your brand, retain customers and help run your business <strong>with clarity.</strong>",
  servicesEyebrow: "AN ECOSYSTEM FOR YOUR BUSINESS", servicesTitle: "Technology built to <em>solve and grow.</em>", servicesLead: "Websites, loyalty systems, digital signage and custom solutions with one clear direction.",
  featureOneTitle: "Websites", featureOneText: "Professional, fast and responsive presence aligned with your brand.", featureTwoTitle: "Web systems", featureTwoText: "Customer, team and administration apps that work on any device.", featureThreeTitle: "Loyalty and PWA", featureThreeText: "Digital cards, QR, stamps, rewards and customer control without an app store.", featureFourTitle: "Digital Signage", featureFourText: "Business display content managed from a phone with photos, videos and a library.",
  planOneTag: "Essential", planOneTitle: "Essential website", planOneSummary: "For small businesses that need a clear and trustworthy presence.", planOneItem1: "Landing page or simple website", planOneItem2: "Responsive design", planOneItem3: "Hosting and SSL", planOneItem4: "Maintenance included", planOneItem5: "Reasonable small changes",
  planTwoTag: "Professional", planTwoTitle: "Professional website", planTwoSummary: "For brands that need more content, customization and features.", planTwoItem1: "Multiple sections", planTwoItem2: "More custom visual design", planTwoItem3: "Forms and additional features", planTwoItem4: "Maintenance and support", planTwoItem5: "Reasonable changes included",
  planThreeTag: "Business", planThreeTitle: "Business solution", planThreeSummary: "For more complete web projects with greater support and maintenance.", planThreeItem1: "Complete web project", planThreeItem2: "Advanced features", planThreeItem3: "Reasonable integrations", planThreeItem4: "Priority attention", planThreeItem5: "Special scope quoted separately",
  hostingTitle: "Hosting, SSL and maintenance included", hostingText: "Monthly plans include publication, secure connection and service maintenance within the agreed scope.", domainTitle: "Domain owned by your business", domainText: "If you need a custom domain, it is registered in your name and its yearly cost is confirmed according to extension and availability.", salesPlatformTitle: "Special features and integrations", salesPlatformText: "Payments, complex catalogues, automation and other integrations are reviewed and quoted for each project.", maintenanceTitle: "Ongoing support", maintenanceText: "Support and reasonable changes are included. New features or major expansions are evaluated separately.",
  formOptionOne: "Monthly website", formOptionTwo: "Loyalty system", formOptionThree: "Digital Signage / TV", formOptionOther: "Custom solution / not sure yet"
});

// Language switching must work even when storage is unavailable or invalid.
let currentLanguage = "es";
try {
  const savedLanguage = localStorage.getItem("haloswebsLanguage");
  if (savedLanguage === "es" || savedLanguage === "en") currentLanguage = savedLanguage;
} catch { /* Keep the default for this visit. */ }

const getWhatsappUrl = (message = currentLanguage === "es" ? siteConfig.defaultWhatsappMessage : "Hi, I saw your HalosWebs website and would like a quote for a website for my business.") =>
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
      <a class="project-card project-card--${project.kind?.replaceAll(' ',' project-card--')||'website'} reveal is-visible" href="${safeUrl}" target="${safeUrl !== "#" ? "_blank" : "_self"}" rel="noopener" aria-label="${translations[currentLanguage].projectVisit}: ${project.title}">
        <span class="project-card__fallback" aria-hidden="true"></span>
        ${project.image ? `<img class="project-card__image" src="${project.image}" alt="${translations[currentLanguage].preview} ${project.title}" loading="lazy" onerror="this.style.display='none'">` : ""}
        ${project.kind?.includes('tv')?'<b class="project-card__tv">TV</b>':''}
        <span class="project-card__content">
          <span>
            <small class="project-card__type">${type}</small>
            <h3>${project.title}</h3>
            <p>${currentLanguage==='es'?project.descriptionEs:project.descriptionEn}</p>
            <em>${currentLanguage==='es'?project.featuresEs:project.featuresEn}</em>
          </span>
          <span class="project-card__arrow" aria-hidden="true">↗</span>
        </span>
      </a>`;
  }).join("");
}

function applyLanguage(language) {
  language = language === "en" ? "en" : "es";
  currentLanguage = language;
  const dictionary = translations[language];
  document.documentElement.lang = language;
  document.title = language === "es" ? "HalosWebs | Soluciones digitales para negocios" : "HalosWebs | Digital solutions for business";

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

  ["aria-label", "title", "alt", "content"].forEach((attribute) => {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
      const key = element.getAttribute(`data-i18n-${attribute}`);
      if (dictionary[key]) element.setAttribute(attribute, dictionary[key]);
    });
  });
  document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(el => el.content = document.title);
  document.querySelector('meta[property="og:locale"]')?.setAttribute("content", language === "es" ? "es_MX" : "en_US");
  document.querySelector('meta[property="og:locale:alternate"]')?.setAttribute("content", language === "es" ? "en_US" : "es_MX");
  updateMenuLabel();

  // Actualiza también el asunto y el mensaje predeterminado del correo al cambiar de idioma.
  setContactLinks();
  renderPortfolio();
  try { localStorage.setItem("haloswebsLanguage", language); } catch { /* Switching still works for this visit. */ }
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

function updateMenuLabel() {
  const toggle = document.querySelector(".menu-toggle");
  if (toggle) toggle.setAttribute("aria-label", translations[currentLanguage][toggle.getAttribute("aria-expanded") === "true" ? "closeMenu" : "openMenu"]);
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
    updateMenuLabel();
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.toggle("is-open");
    menuToggle.classList.toggle("is-active", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("menu-open", isOpen);
    updateMenuLabel();
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
    const plan = document.getElementById("contact-plan").selectedOptions[0].textContent;
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
