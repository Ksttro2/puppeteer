import puppeteer from "puppeteer";

const credenciales = [
  { usuario: "admin", password: "Gpon2016CLARO!" },
  { usuario: "admin@claro", password: "Gpon2016CLARO!" }
];

async function openWebPage() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
    ],
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://10.177.120.153", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Saltar advertencia SSL
    try {
      await page.waitForSelector("#details-button", { timeout: 5000 });
      await page.click("#details-button");
      await page.waitForSelector("#proceed-link", { timeout: 5000 });
      await page.click("#proceed-link");
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      console.log("➡️ Saltó advertencia SSL");
    } catch {
      console.log("⚠️ Advertencia SSL no apareció o ya fue pasada.");
    }

    let loginExitoso = false;

    for (let cred of credenciales) {
      console.log(`🔐 Probando login con: ${cred.usuario}`);

      await page.waitForSelector("#Frm_Username", { timeout: 5000 });
      await page.waitForSelector("#Frm_Password", { timeout: 5000 });

      await page.click("#Frm_Username", { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.click("#Frm_Password", { clickCount: 3 });
      await page.keyboard.press('Backspace');

      await page.type("#Frm_Username", cred.usuario, { delay: 50 });
      await page.type("#Frm_Password", cred.password, { delay: 50 });

      await Promise.all([
        page.click("#LoginId"),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      ]);

      if (page.url().includes("start.ghtml")) {
        console.log(`✅ Login exitoso con: ${cred.usuario}`);
        loginExitoso = true;
        break;
      } else {
        console.log(`❌ Falló login con: ${cred.usuario}`);
        await page.goto("https://10.177.120.153", {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
      }
    }

    if (!loginExitoso) {
      console.log("❌ Ninguna credencial funcionó.");
      return;
    }

    // Exponer función para capturar coordenadas
    await page.exposeFunction("registrarClick", (x, y) => {
      console.log(`📍 Coordenadas del clic: x=${x}, y=${y}`);
    });

    // Agregar listener al documento desde el navegador
    await page.evaluate(() => {
      document.addEventListener("click", function handleClick(e) {
        if (typeof window.registrarClick === "function") {
          window.registrarClick(e.clientX, e.clientY);
        } else {
          console.warn("⚠️ registrarClick no está definida aún.");
        }
      });

      // Agregar botón visual para pruebas
      const btn = document.createElement("button");
      btn.textContent = "🖱 Probar captura de coordenadas";
      btn.style.position = "fixed";
      btn.style.top = "10px";
      btn.style.left = "10px";
      btn.style.zIndex = 9999;
      btn.onclick = (e) => {
        if (typeof window.registrarClick === "function") {
          window.registrarClick(e.clientX, e.clientY);
        }
      };
      document.body.appendChild(btn);
    });

    console.log("🕒 Esperando a que hagas clic manual en 'Security' o en el botón...");
    console.log("👉 Haz clic y observa las coordenadas en consola.");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Espera 30 segundos
    console.log("✅ Tiempo de espera terminado.");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    // await browser.close(); // Descomenta si quieres cerrar el navegador al final
  }
}

openWebPage();
