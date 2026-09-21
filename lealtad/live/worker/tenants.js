const classic={name:'Clásico'};
export const TENANTS={
 renace:{slug:'renace',hostname:'renacecafe.haloswebs.com',displayName:'Renace Café Shop',shortName:'Renace',cardPrefix:'REN',rewardGoal:9,rewardName:'Café gratis',timezone:'America/Tijuana',logo:'/assets/logo-renace.png',icon:'/assets/app-icon.svg',touchIcon:'/assets/logo-renace.png',colors:{cream:'#f5f1e7',ink:'#424b32',accent:'#697449'},stampStyles:{classic,cowboy:{name:'Vaquero',src:'/assets/stamps/stamp-cowboy.webp'},bow:{name:'Moño',src:'/assets/stamps/stamp-bow.webp'}},socialLinks:[{label:'Instagram',url:'https://www.instagram.com/renacecafeshop/'},{label:'TikTok',url:'https://www.tiktok.com/@renace.caf.shop'},{label:'Ver menú',url:'https://renacecafe.com/#menu'},{label:'Cómo llegar',url:'https://maps.app.goo.gl/qGTTcQmMwrb7Y5WA7'}],address:'Blvd. Gustavo Díaz Ordaz 1111, Los Arboles, 22117 Tijuana, B.C.',texts:{concept:'Y el 10.º café va por nuestra cuenta.',ready:'Tu café gratis está listo.',tagline:'Tu momento favorito empieza con café.'},replacements:[]},
 mooncoffee:{slug:'mooncoffee',hostname:'mooncoffee.haloswebs.com',displayName:'MOON Coffee',shortName:'MOON',cardPrefix:'MOON',rewardGoal:8,rewardName:'Bebida gratis',timezone:'America/Tijuana',logo:'/assets/moon/logo-moon.png',icon:'/assets/moon/icon-moon.png',touchIcon:'/assets/moon/icon-192.png',colors:{cream:'#fbf3e4',ink:'#39291e',accent:'#bd823d'},stampStyles:{classic,moon:{name:'Luna',src:'/assets/stamps/stamp-moon.svg'}},socialLinks:[{label:'Facebook',url:'https://www.facebook.com/profile.php?id=61592504380202'},{label:'Instagram',url:'https://www.instagram.com/moon.coffee.tj/'},{label:'TikTok',url:'https://www.tiktok.com/@moon.coffee.tj0'}],address:'',texts:{concept:'La 9ª bebida es gratis.',ready:'Bebida gratis disponible.',tagline:'Tu pausa favorita, bajo la misma luna.'},replacements:[
 ['Renace Café Shop','MOON Coffee'],['RENACE CAFÉ SHOP','MOON COFFEE'],['Renace Card','MOON Coffee'],['Renace','MOON'],['RENACE','MOON'],
 ['Tu momento favorito empieza con café.','Tu pausa favorita, bajo la misma luna.'],['Tu momento<br>favorito empieza<br><em>con café.</em>','Un café.<br>Una pausa.<br><em>Tu momento.</em>'],
 ['9 sellos. Tu décimo café gratis.','8 sellos. La 9ª bebida es gratis.'],['Con 9 sellos','Con 8 sellos'],['Acumula 9 sellos','Acumula 8 sellos'],['9/9','8/8'],['0/9','0/8'],['entre 0 y 9','entre 0 y 8'],['9 visitas · Un café de regalo','8 visitas · Una bebida de regalo'],['el 10.º café es gratis','la 9ª bebida es gratis'],
 ['Clásico, Vaquero o Moño','Clásico o Luna'],['REN-','MOON-'],['>R</div>','>☾</div>'],['/assets/app-icon.svg','/assets/moon/icon-moon.png'],
 ['Instagram, TikTok, menú y ubicación','Facebook, Instagram y TikTok'],['¡Café gratis disponible!','¡Bebida gratis disponible!'],['Canjear café gratis','Canjear bebida gratis'],['Café canjeado','Bebida canjeada'],['Cafés canjeados','Bebidas canjeadas'],['café gratis','bebida gratis'],['tu café gratis','tu bebida gratis'],['el siguiente café es gratis','la siguiente bebida es gratis']
 ]}
};
export function resolveTenant(url,env){
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const tenant=local?TENANTS[env.DEV_TENANT||'renace']:Object.values(TENANTS).find(t=>t.hostname===url.hostname);
 return tenant?{...tenant,demo:local&&env.ALLOW_DEMO==='true'}:null;
}
export function publicTenant(t){return {...t};}
export function tenantText(value,t){for(const [from,to] of t.replacements)value=value.split(from).join(to);return value;}
