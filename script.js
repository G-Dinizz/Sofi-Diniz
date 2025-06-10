// Atualização no script.js para lidar com diferentes ícones de botão de envio no WhatsApp Web

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function iniciarBot(numeros, mensagem, intervaloMin, intervaloMax, usuario) {
    const pastaSessao = path.join(__dirname, 'whatsapp-sessions', usuario);

    if (!fs.existsSync(pastaSessao)) {
        fs.mkdirSync(pastaSessao, { recursive: true });
    }

    const browser = await puppeteer.launch({ 
        headless: false, 
        userDataDir: pastaSessao
    });

    const page = await browser.newPage();
    console.log(`⌛ [${usuario}] Aguardando o carregamento do WhatsApp Web...`);
    await page.goto('https://web.whatsapp.com');

    try {
        await page.waitForSelector("div[title='Caixa de texto para digitar uma mensagem']", { timeout: 60000 });
        console.log(`✅ [${usuario}] WhatsApp Web pronto!`);
    } catch (error) {
        console.log(`⚠️ [${usuario}] WhatsApp não carregou corretamente.`);
    }

    const falhas = [];

    for (let numero of numeros) {
        let tentativas = 0;
        let enviadoComSucesso = false;

        while (tentativas < 3 && !enviadoComSucesso) {
            tentativas++;
            console.log(`🔁 [${usuario}] Tentativa ${tentativas} para enviar a ${numero}...`);

            const url = `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensagem)}`;
            await page.goto(url);

            await new Promise(resolve => setTimeout(resolve, 5000));

            try {
                await page.waitForFunction(() => {
                    return (
                        document.querySelector("span[data-icon='send']") ||
                        document.querySelector("button[aria-label='Send']") ||
                        document.querySelector("span[data-icon='wds-ic-send-filled']") ||
                        document.body.innerText.includes("não está no WhatsApp")
                    );
                }, { timeout: 60000 });

                const temErro = await page.evaluate(() => {
                    const texto = document.body.innerText;
                    return (
                        texto.includes("Esse número de telefone não está no WhatsApp") ||
                        texto.includes("não é um número válido") ||
                        texto.includes("Tente novamente") ||
                        texto.includes("Não foi possível iniciar uma conversa") ||
                        texto.includes("Fechar")
                    );
                });

                if (temErro) {
                    console.log(`🚫 [${usuario}] Número inválido ou bloqueado: ${numero}`);
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 20000));

                const sendButton = await page.$("button[aria-label='Send'], span[data-icon='send'], span[data-icon='wds-ic-send-filled']");
                if (sendButton) {
                    await sendButton.click();
                    console.log(`📩 [${usuario}] Mensagem enviada para: ${numero}`);
                    enviadoComSucesso = true;
                } else {
                    throw new Error("Botão de envio não encontrado.");
                }

            } catch (error) {
                console.log(`⚠️ [${usuario}] Erro ao tentar enviar para ${numero} (tentativa ${tentativas}): ${error.message}`);

                if (tentativas === 3 && !enviadoComSucesso) {
                    console.log(`🔄 [${usuario}] Tentando recarregar a página como último recurso...`);
                    try {
                        await page.reload({ waitUntil: 'domcontentloaded' });
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } catch (reloadError) {
                        console.log(`⚠️ [${usuario}] Falha ao recarregar a página: ${reloadError.message}`);
                    }
                }

                if (tentativas < 3) {
                    console.log(`⏳ Aguardando 10s antes da nova tentativa...`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        }

        if (!enviadoComSucesso) {
            console.log(`❌ [${usuario}] Falha ao enviar mensagem para ${numero} após 3 tentativas.`);
            falhas.push(numero);
        }

        const tempoEspera = Math.random() * (intervaloMax - intervaloMin) + intervaloMin;
        console.log(`⏳ [${usuario}] Aguardando ${(tempoEspera / 1000).toFixed(2)} segundos antes do próximo envio...`);
        await new Promise(r => setTimeout(r, tempoEspera));
    }

    if (falhas.length > 0) {
        const caminhoFalhas = path.join(__dirname, `falhas-${usuario}.txt`);
        fs.writeFileSync(caminhoFalhas, falhas.join('\n'));
        console.log(`📝 Números com falha foram salvos em: ${caminhoFalhas}`);
    }

    console.log(`✅ [${usuario}] Todas as mensagens processadas. Fechando navegador...`);
    await browser.close();
}

module.exports = { iniciarBot };
