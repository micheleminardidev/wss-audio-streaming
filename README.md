# AudioVideo – HTTPS/WSS

Questo progetto può girare in HTTP o HTTPS. Il server usa automaticamente HTTPS se trova `certs/key.pem` e `certs/cert.pem` (o se gli passi i path tramite variabili d'ambiente). Il client WebSocket passa a `wss://` quando la pagina è servita in HTTPS.

## Struttura
- `server.js`: server HTTP/HTTPS + WebSocket
- `public/`: statici (client)
- `recordings/`: registrazioni `.webm`
- `certs/`: (non in repo) metti qui `key.pem` e `cert.pem`

## Attivare HTTPS su Windows

Hai due opzioni.

### Opzione A – mkcert (consigliata)
1. Installa mkcert (da PowerShell Admin):
   ```powershell
   choco install mkcert -y
   # oppure con Scoop
   # scoop install mkcert
   ```
2. Inizializza la CA locale:
   ```powershell
   mkcert -install
   ```
3. Genera un certificato per `localhost` (includi anche IP, se vuoi provare da un altro device):
   ```powershell
   cd d:\audiovideo
   mkdir certs -Force
   mkcert -key-file certs\key.pem -cert-file certs\cert.pem localhost 127.0.0.1 ::1
   # esempio con IP LAN
   # mkcert -key-file certs\key.pem -cert-file certs\cert.pem localhost 127.0.0.1 ::1 192.168.1.50
   ```

### Opzione B – Certificato self-signed con PowerShell + OpenSSL
1. Crea il certificato nel certificato macchina:
   ```powershell
   $cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\\LocalMachine\\My" -FriendlyName "audiovideo-localhost"
   ```
2. Esporta in PFX con password temporanea:
   ```powershell
   $pwd = ConvertTo-SecureString -String "changeit" -Force -AsPlainText
   Export-PfxCertificate -Cert $cert -FilePath d:\audiovideo\certs\localhost.pfx -Password $pwd
   ```
3. Converti PFX in `key.pem` e `cert.pem` con OpenSSL (installa OpenSSL se manca):
   ```powershell
   # Estrai la chiave privata (key.pem)
   openssl pkcs12 -in certs\localhost.pfx -nocerts -nodes -passin pass:changeit -out certs\key.pem
   # Estrai il certificato (cert.pem)
   openssl pkcs12 -in certs\localhost.pfx -clcerts -nokeys -passin pass:changeit -out certs\cert.pem
   ```
4. Aggiungi (se serve) `cert.pem` tra le Autorità di certificazione radice attendibili di Windows per evitare warning nei browser.

## Avvio
Se hai creato `d:\audiovideo\certs\key.pem` e `d:\audiovideo\certs\cert.pem`, ti basta:
```powershell
npm start
```
Il server mostrerà un URL `https://localhost:3000`.

Se i file sono in un altro percorso, esporta le variabili prima di avviare:
```powershell
$env:SSL_KEY_PATH = "D:\\path\\to\\key.pem"; $env:SSL_CERT_PATH = "D:\\path\\to\\cert.pem"; npm start
```

### Redirect opzionale HTTP -> HTTPS
Per avere un redirect automatico da una porta HTTP (es. 3001) verso HTTPS (3000):
```powershell
$env:HTTP_REDIRECT_PORT = "3001"; npm start
```
Poi visita `http://localhost:3001` e verrai reindirizzato a `https://localhost:3000`.

## Note
- Chrome richiede HTTPS per camera e microfono, ma fa un’eccezione per `http://localhost`. Con un altro host/IP, usa HTTPS.
- Se provi da altri dispositivi sulla LAN, genera il certificato includendo l’IP nel comando mkcert e usa quell’IP nell’URL.
- I file di registrazione vengono salvati in `recordings/`.
