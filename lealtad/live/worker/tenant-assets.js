import { publicTenant, tenantText } from './tenants.js';

export async function tenantAssets(request, env) {
  const url = new URL(request.url);
  const t = env.TENANT;

  // Configuración pública del tenant para el frontend.
  if (url.pathname === '/assets/tenant.js') {
    return new Response(
      'window.LoyaltyTenant=' + JSON.stringify(publicTenant(t)) + ';',
      {
        headers: {
          'content-type': 'application/javascript'
        }
      }
    );
  }

  // Manifest PWA dinámico según la cafetería.
  if (url.pathname === '/manifest.webmanifest') {
    const icons =
      t.slug === 'mooncoffee'
        ? [
            {
              src: t.icon,
              sizes: 'any',
              type: 'image/png'
            },
            {
              src: '/assets/moon/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/assets/moon/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            }
          ]
        : [
            {
              src: t.icon,
              sizes: 'any',
              type: 'image/svg+xml'
            },
            {
              src: '/assets/logo-renace.png',
              sizes: '1073x464',
              type: 'image/png'
            }
          ];

    return Response.json({
      id: '/',
      name: t.displayName + ' · Lealtad',
      short_name: t.shortName,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: t.colors.cream,
      theme_color: t.colors.cream,
      lang: 'es-MX',
      icons
    });
  }

  const res = await env.ASSETS.fetch(request);

  // Service Worker adaptado a cada tenant.
  if (url.pathname === '/service-worker.js') {
    let code = await res.text();

    code = code
      .replace(
        'renace-shell-v8',
        t.slug + '-shell-v9'
      )
      .replace(
        "'/assets/style.css'",
        "'/assets/tenant.js','/assets/tenant.css','/assets/style.css'"
      );

    code = code.replace(
      "key.startsWith('renace-shell-')",
      `(key.startsWith('${t.slug}-shell-')||key.startsWith('renace-shell-'))`
    );

    code = code
      .replace(
        "'/assets/logo-renace.png'",
        JSON.stringify(t.logo)
      )
      .replace(
        "'/assets/app-icon.svg'",
        JSON.stringify(t.icon)
      );

    code = code.replace(
      "'/assets/stamps/stamp-cowboy.webp','/assets/stamps/stamp-bow.webp'",
      Object.values(t.stampStyles)
        .filter(style => style.src)
        .map(style => JSON.stringify(style.src))
        .join(',')
    );

    return new Response(code, {
      headers: {
        'content-type': 'application/javascript'
      }
    });
  }

  // HTML dinámico con branding específico para cada cafetería.
  if ((res.headers.get('content-type') || '').includes('text/html')) {
    let html = await res.text();

    html = tenantText(html, t)
      .replaceAll('/assets/logo-renace.png', t.logo)
      .replaceAll('#f5f1e7', t.colors.cream);

    // Identifica visualmente el tenant para CSS.
    html = html.replace(
      '<html lang="es">',
      `<html lang="es" data-tenant="${t.slug}">`
    );

    // Carga configuración del tenant antes de help.js.
    html = html.replace(
      '<script defer src="/assets/help.js">',
      '<script defer src="/assets/tenant.js"></script><script defer src="/assets/help.js">'
    );

    // CSS específico del tenant.
    html = html.replace(
      '</head>',
      '<link rel="stylesheet" href="/assets/tenant.css"></head>'
    );

    // Favicon correcto.
    const faviconType = t.icon.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'image/svg+xml';

    html = html.replace(
      /<link rel="icon"[^>]*>/i,
      `<link rel="icon" type="${faviconType}" href="${t.icon}?v=6">`
    );

    // Icono usado por iPhone/iPad al agregar a inicio.
    html = html.replace(
      /<link rel="apple-touch-icon"[^>]*>/i,
      `<link rel="apple-touch-icon" href="${t.touchIcon}">`
    );

    return new Response(html, {
      status: res.status,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    });
  }

  return res;
}