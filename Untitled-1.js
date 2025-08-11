}import puppeteer from "puppeteer";

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

    // Saltar advertencia de seguridad si aparece
    try {
      await page.waitForSelector("#details-button", { timeout: 5000 });
      await page.click("#details-button");
      await page.waitForSelector("#proceed-link", { timeout: 5000 });
      await page.click("#proceed-link");
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      console.log("➡️ Saltó advertencia SSL");
    } catch (err) {
      console.log("⚠️ Advertencia SSL no apareció o ya fue pasada.");
    }

    let loginExitoso = false;

    for (let cred of credenciales) {
      console.log(`🔐 Probando login con: ${cred.usuario}`);

      await page.waitForSelector("#Frm_Username", { timeout: 5000 });
      await page.waitForSelector("#Frm_Password", { timeout: 5000 });

      // Limpiar campos
      await page.click("#Frm_Username", { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.click("#Frm_Password", { clickCount: 3 });
      await page.keyboard.press('Backspace');

      // Ingresar usuario y contraseña
      await page.type("#Frm_Username", cred.usuario, { delay: 50 });
      await page.type("#Frm_Password", cred.password, { delay: 50 });

      // Hacer login
      await Promise.all([
        page.click("#LoginId"),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      ]);

      const url = page.url();
      if (url.includes("start.ghtml")) {
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

    // Esperar manualmente a que el usuario haga clic en "Security"
    console.log("🕒 Esperando 30 segundos para que hagas clic manualmente en 'Security'...");
    await new Promise(resolve => setTimeout(resolve, 30000));  // Espera de 30 segundos

    // Ahora buscar el checkbox y tomar coordenadas
    await page.waitForSelector('#Frm_IsProtect', { timeout: 10000 });

    const element = await page.$('#Frm_IsProtect');
    const box = await element.boundingBox();

    if (box) {
      console.log(`📍 Coordenadas del elemento: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      console.log("⚠️ No se pudieron obtener las coordenadas del elemento.");
    }

    await page.screenshot({ path: 'coordenadas.png' });
    console.log("🛡️ Hizo clic en 'Security'");

    // Validar y marcar checkbox si no está marcado
    const isChecked = await page.$eval("#Frm_IsProtect", el => el.checked);
    console.log(`🔍 Checkbox 'IsProtect' está ${isChecked ? "seleccionado" : "NO seleccionado"}`);

    if (!isChecked) {
      await page.click("#Frm_IsProtect");
      console.log("✅ Checkbox marcado manualmente.");
    }

    // Enviar formulario
    await page.waitForSelector("#Btn_Submit", { timeout: 5000 });
    await page.click("#Btn_Submit");
    console.log("📤 Hizo clic en 'Submit'");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    // Puedes cerrar el navegador si ya no lo necesitas
    // await browser.close();
  }
}

openWebPage();
