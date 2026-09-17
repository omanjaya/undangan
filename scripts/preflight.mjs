const required = ['APP_DOMAIN','APP_URL','OWNER_EMAIL','OWNER_PASSWORD','POSTGRES_PASSWORD'];
const failures = required.filter(key=>!process.env[key] || /REPLACE_|example\.com/.test(process.env[key])).map(key=>`${key} belum diisi dengan nilai production.`);
try {const url=new URL(process.env.APP_URL);if(url.protocol!=='https:'||url.hostname!==process.env.APP_DOMAIN||url.username||url.password||url.pathname!=='/'||url.search||url.hash) failures.push('APP_URL harus berupa origin HTTPS dengan hostname sama dengan APP_DOMAIN.');}catch{failures.push('APP_URL tidak valid.');}
if((process.env.OWNER_PASSWORD||'').length<16||process.env.OWNER_PASSWORD==='demo-undangan-2026') failures.push('Password pemilik minimal 16 karakter dan bukan password demo.');
if(!/^[a-f0-9]{32,}$/i.test(process.env.POSTGRES_PASSWORD||''))failures.push('Gunakan POSTGRES_PASSWORD hex acak minimal 32 karakter agar aman dimasukkan ke URI.');
if(failures.length){console.error(failures.join('\n'));process.exit(1);}console.log('Konfigurasi production valid. Secret tidak ditampilkan.');
