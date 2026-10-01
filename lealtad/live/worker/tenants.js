const classic={name:'Clásico'};

export const TENANTS={
 renace:{
  slug:'renace',hostname:'renacecafe.haloswebs.com',displayName:'Renace Café Shop',shortName:'Renace',cardPrefix:'REN',
  rewardGoal:9,rewardName:'Café gratis',timezone:'America/Tijuana',stampPolicy:'daily',maxStampsPerTransaction:1,petFriendly:false,
  cardLayout:{stampColumns:5,stampRows:2,rewardSlot:true,variant:'renace'},
  logo:'/assets/logo-renace.png',icon:'/assets/app-icon.svg',touchIcon:'/assets/logo-renace.png',
  pwaIcons:[{src:'/assets/app-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'},{src:'/assets/logo-renace.png',sizes:'1073x464',type:'image/png'}],
  colors:{cream:'#f5f1e7',ink:'#424b32',accent:'#697449'},
  stampStyles:{classic,cowboy:{name:'Vaquero',src:'/assets/stamps/stamp-cowboy.webp'},bow:{name:'Moño',src:'/assets/stamps/stamp-bow.webp'}},
  socialLinks:[{label:'Instagram',url:'https://www.instagram.com/renacecafeshop/'},{label:'TikTok',url:'https://www.tiktok.com/@renace.caf.shop'},{label:'Ver menú',url:'https://renacecafe.com/#menu'},{label:'Cómo llegar',url:'https://maps.app.goo.gl/qGTTcQmMwrb7Y5WA7'}],
  address:'Blvd. Gustavo Díaz Ordaz 1111, Los Arboles, 22117 Tijuana, B.C.',
  texts:{concept:'Y el 10.º café va por nuestra cuenta.',ready:'Tu café gratis está listo.',tagline:'Tu momento favorito empieza con café.'},
  replacements:[]
 },
 mooncoffee:{
  slug:'mooncoffee',hostname:'mooncoffee.haloswebs.com',displayName:'MOON Coffee',shortName:'MOON',cardPrefix:'MOON',
  rewardGoal:8,rewardName:'Bebida gratis',timezone:'America/Tijuana',stampPolicy:'daily',maxStampsPerTransaction:1,petFriendly:false,
  cardLayout:{stampColumns:4,stampRows:2,rewardSlot:false,variant:'moon'},
  logo:'/assets/moon/logo-moon.png',icon:'/assets/moon/icon-moon.png',touchIcon:'/assets/moon/icon-192.png',
  pwaIcons:[{src:'/assets/moon/icon-moon.png',sizes:'any',type:'image/png'},{src:'/assets/moon/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/assets/moon/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}],
  colors:{cream:'#fbf3e4',ink:'#39291e',accent:'#bd823d'},
  stampStyles:{classic,moon:{name:'Luna',src:'/assets/stamps/stamp-moon.svg'}},
  socialLinks:[{label:'Facebook',url:'https://www.facebook.com/profile.php?id=61592504380202'},{label:'Instagram',url:'https://www.instagram.com/moon.coffee.tj/'},{label:'TikTok',url:'https://www.tiktok.com/@moon.coffee.tj0'}],
  address:'',texts:{concept:'La 9ª bebida es gratis.',ready:'Bebida gratis disponible.',tagline:'Tu pausa favorita, bajo la misma luna.'},
  replacements:[
   ['Renace Café Shop','MOON Coffee'],['RENACE CAFÉ SHOP','MOON COFFEE'],['Renace Card','MOON Coffee'],['Renace','MOON'],['RENACE','MOON'],
   ['Tu momento favorito empieza con café.','Tu pausa favorita, bajo la misma luna.'],['Tu momento<br>favorito empieza<br><em>con café.</em>','Un café.<br>Una pausa.<br><em>Tu momento.</em>'],
   ['9 sellos. Tu décimo café gratis.','8 sellos. La 9ª bebida es gratis.'],['Con 9 sellos','Con 8 sellos'],['Acumula 9 sellos','Acumula 8 sellos'],['9/9','8/8'],['0/9','0/8'],['entre 0 y 9','entre 0 y 8'],['9 visitas · Un café de regalo','8 visitas · Una bebida de regalo'],['el 10.º café es gratis','la 9ª bebida es gratis'],
   ['Clásico, Vaquero o Moño','Clásico o Luna'],['REN-','MOON-'],['>R</div>','>☾</div>'],['/assets/app-icon.svg','/assets/moon/icon-moon.png'],
   ['Instagram, TikTok, menú y ubicación','Facebook, Instagram y TikTok'],['¡Café gratis disponible!','¡Bebida gratis disponible!'],['Canjear café gratis','Canjear bebida gratis'],['Café canjeado','Bebida canjeada'],['Cafés canjeados','Bebidas canjeadas'],['café gratis','bebida gratis'],['tu café gratis','tu bebida gratis'],['el siguiente café es gratis','la siguiente bebida es gratis']
  ]
 },
 santofe:{
  slug:'santofe',hostname:'santofe.haloswebs.com',displayName:'Santofé',shortName:'Santofé',cardPrefix:'SANTOFE',
  rewardGoal:10,rewardName:'Café gratis',timezone:'America/Tijuana',stampPolicy:'per_item',maxStampsPerTransaction:10,petFriendly:true,
  cardLayout:{stampColumns:5,stampRows:2,rewardSlot:false,variant:'santofe'},
  logo:'/assets/santofe/logo-santofe.png',icon:'/assets/santofe/icon-192-v2.png',touchIcon:'/assets/santofe/icon-192-v2.png',
  pwaIcons:[{src:'/assets/santofe/icon-192-v2.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/assets/santofe/icon-512-v2.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}],
  colors:{cream:'#e8ecde',ink:'#6f5e62',accent:'#77666a'},
  stampStyles:{santofe:{name:'Santofé',src:'/assets/santofe/mark-santofe.png'}},
  socialLinks:[{label:'Facebook',url:'https://www.facebook.com/profile.php?id=61578395980108'},{label:'Instagram',url:'https://www.instagram.com/santofe_mx/'},{label:'TikTok',url:'https://www.tiktok.com/@santofecafe'}],
  address:'',texts:{concept:'El café número 11 va por nuestra cuenta.',ready:'Tu café gratis está listo.',tagline:'Coffee · Deli · Pet friendly.'},
  replacements:[
   ['Renace Café Shop','Santofé'],['RENACE CAFÉ SHOP','SANTOFÉ'],['Renace Card','Santofé'],['Renace','Santofé'],['RENACE','SANTOFÉ'],
   ['Tu momento favorito empieza con café.','Coffee · Deli · Pet friendly.'],['Tu momento<br>favorito empieza<br><em>con café.</em>','Coffee.<br>Deli.<br><em>Santofé.</em>'],
   ['9 sellos. Tu décimo café gratis. Un sello por día.','10 sellos. Tu café número 11 es gratis. Un sello por cada café comprado.'],['Con 9 sellos','Con 10 sellos'],['Acumula 9 sellos','Acumula 10 sellos'],['9/9','10/10'],['0/9','0/10'],['entre 0 y 9','entre 0 y 10'],['9 visitas · Un café de regalo','10 cafés · Un café de regalo'],['el 10.º café es gratis','el café número 11 es gratis'],
   ['Clásico, Vaquero o Moño','Santofé'],['REN-','SANTOFE-'],['>R</div>','>S</div>'],['/assets/app-icon.svg','/assets/santofe/logo-santofe.png'],
   ['Instagram, TikTok, menú y ubicación','Facebook, Instagram y TikTok'],['Cada visita cuenta.','Cada café cuenta.'],['Cada visita te acerca','Cada café te acerca'],['Confirma la compra antes de registrar el sello.','Confirma cuántos cafés compró antes de registrar los sellos.'],['Muestra tu QR en caja para sumar el sello del día.','Muestra tu QR en caja para sumar un sello por cada café comprado.'],
   ['el siguiente café es gratis','el café número 11 es gratis']
  ]
 }
};

export function resolveTenant(url,env){
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const tenant=local?TENANTS[env.DEV_TENANT||'renace']:Object.values(TENANTS).find(t=>t.hostname===url.hostname);
 return tenant?{...tenant,demo:local&&env.ALLOW_DEMO==='true'}:null;
}
export function publicTenant(t){return {...t};}
export function tenantText(value,t){for(const [from,to] of t.replacements)value=value.split(from).join(to);return value;}
