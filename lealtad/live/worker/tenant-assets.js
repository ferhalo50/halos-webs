import {publicTenant,tenantText} from './tenants.js';
export async function tenantAssets(request,env){
 const url=new URL(request.url),t=env.TENANT;
 if(url.pathname==='/assets/tenant.js')return new Response('window.LoyaltyTenant='+JSON.stringify(publicTenant(t))+';', {headers:{'content-type':'application/javascript'}});
 if(url.pathname==='/manifest.webmanifest')return Response.json({id:'/',name:t.displayName+' · Lealtad',short_name:t.shortName,start_url:'/',scope:'/',display:'standalone',background_color:t.colors.cream,theme_color:t.colors.cream,lang:'es-MX',icons:[{src:t.icon,sizes:'any',type:'image/svg+xml'},...(t.slug==='mooncoffee'?[192,512].map(size=>({src:`/assets/moon/icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any maskable'})):[{src:'/assets/logo-renace.png',sizes:'1073x464',type:'image/png'}])]});
 const res=await env.ASSETS.fetch(request);
 if(url.pathname==='/service-worker.js'){
  let code=await res.text();code=code.replace('renace-shell-v8',t.slug+'-shell-v9').replace("'/assets/style.css'","'/assets/tenant.js','/assets/tenant.css','/assets/style.css'");
  code=code.replace("key.startsWith('renace-shell-')",`(key.startsWith('${t.slug}-shell-')||key.startsWith('renace-shell-'))`);
  code=code.replace("'/assets/logo-renace.png'",JSON.stringify(t.logo)).replace("'/assets/app-icon.svg'",JSON.stringify(t.icon));
  code=code.replace("'/assets/stamps/stamp-cowboy.webp','/assets/stamps/stamp-bow.webp'",Object.values(t.stampStyles).filter(s=>s.src).map(s=>JSON.stringify(s.src)).join(','));
  return new Response(code,{headers:{'content-type':'application/javascript'}});
 }
 if((res.headers.get('content-type')||'').includes('text/html')){
  let html=await res.text();html=tenantText(html,t).replaceAll('/assets/logo-renace.png',t.logo).replaceAll('#f5f1e7',t.colors.cream);
  html=html.replace('<html lang="es">',`<html lang="es" data-tenant="${t.slug}">`).replace('<script defer src="/assets/help.js">','<script defer src="/assets/tenant.js"></script><script defer src="/assets/help.js">').replace('</head>','<link rel="stylesheet" href="/assets/tenant.css"></head>');
  html=html.replace(`rel="apple-touch-icon" href="${t.logo}"`,`rel="apple-touch-icon" href="${t.touchIcon}"`);
  return new Response(html,{status:res.status,headers:{'content-type':'text/html; charset=utf-8'}});
 }
 return res;
}
