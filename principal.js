import puppeteer from "puppeteer";
import fs from "fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const credenciales = [
  { usuario: "admin", password: "Gpon2016CLARO!" },
  { usuario: "admin@claro", password: "Gpon2016CLARO!" }
];

// Función para encontrar coordenadas de la imagen objetivo en el screenshot
async function findImageCoordinates(page, targetImagePath) {
  await page.screenshot({ path: "fullpage.png", fullPage: true });

  const fullImage = PNG.sync.read(fs.readFileSync("fullpage.png"));
  const target = PNG.sync.read(fs.readFileSync(targetImagePath));

  const { width: fw, height: fh } = fullImage;
  const { width: tw, height: th } = target;

  for (let y = 0; y < fh - th; y++) {
    for (let x = 0; x < fw - tw; x++) {
      const region = {
        data: new Uint8Array(tw * th * 4),
        width: tw,
        height: th,
      };

      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          const srcIndex = ((y + ty) * fw + (x + tx)) * 4;
          const tgtIndex = (ty * tw + tx) * 4;
          for (let i = 0; i < 4; i++) {
            region.data[tgtIndex + i] = fullImage.data[srcIndex + i];
          }
        }
      }

      const diff = pixelmatch(target.data, region.data, null, tw, th, {
        threshold: 0.1,
      });

      if (diff < 100) {
        return { x: x + tw / 2, y: y + th / 2 };
      }
    }
  }

  return null;
}

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
  await page.setViewport({ width: 1366, height: 768 });

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

    for (let i = 0; i < credenciales.length; i++) {
      const cred = credenciales[i];
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

        // Volver al login
        await page.goto("https://10.177.120.153", {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        // Volver a pasar advertencia si aparece otra vez
        try {
          await page.waitForSelector("#details-button", { timeout: 3000 });
          await page.click("#details-button");
          await page.waitForSelector("#proceed-link", { timeout: 3000 });
          await page.click("#proceed-link");
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          console.log("🔁 Advertencia SSL reapareció y fue saltada.");
        } catch (e) {
          // Si no aparece, continuar
        }
      }
    }

    if (!loginExitoso) {
      console.log("❌ Ninguna credencial funcionó.");
      return;
    }

    // Esperar que cargue interfaz
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Buscar coordenadas de la imagen y hacer clic
    await page.mouse.click(356.5, 236.5);
    console.log("🛡️ Hizo clic en 'Security'");
    

    // ✅ Validar y marcar checkbox si no está marcado
    await page.waitForSelector("#Frm_IsProtect", { timeout: 5000 });
    const isChecked = await page.$eval("#Frm_IsProtect", el => el.checked);
    console.log(`🔍 Checkbox 'IsProtect' está ${isChecked ? "seleccionado" : "NO seleccionado"}`);

    if (!isChecked) {
      await page.click("#Frm_IsProtect");
      console.log("✅ Checkbox marcado manualmente.");
    }

    // ✅ Hacer clic en "Submit"
    await page.waitForSelector("#Btn_Submit", { timeout: 5000 });
    await page.click("#Btn_Submit");
    console.log("📤 Hizo clic en 'Submit'");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    // await browser.close(); // Descomenta si quieres cerrarlo al final
  }
}

openWebPage();
