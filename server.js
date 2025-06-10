// server.js ATUALIZADO COM CONTROLE DE EXECUÇÃO E STATUS DE CONEXÃO
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { iniciarBot } = require('./script');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const statusPorUsuario = {};
const controleExecucao = {};

app.post('/enviar', async (req, res) => {
    const { numeros, mensagem, intervaloMin, intervaloMax, usuarios } = req.body;

    try {
        if (!usuarios || usuarios.length === 0) {
            return res.status(400).json({ sucesso: false, mensagem: "Nenhum usuário selecionado." });
        }

        for (const usuario of usuarios) {
            statusPorUsuario[usuario] = {
                total: numeros.length,
                enviados: 0,
                falhas: 0,
                atual: null,
                posicao: 0,
                tempoRestante: 0,
                restantes: [...numeros],
                mensagem
            };
            controleExecucao[usuario] = { status: 'executando' };

            iniciarBotComStatus(numeros, mensagem, intervaloMin, intervaloMax, usuario);
        }

        res.json({ sucesso: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false, mensagem: "Erro ao iniciar disparo.", erro });
    }
});

async function iniciarBotComStatus(numeros, mensagem, intervaloMin, intervaloMax, usuario) {
    await iniciarBot(numeros, mensagem, intervaloMin, intervaloMax, usuario, (numero, status, tempoRestante, posicao) => {
        if (!statusPorUsuario[usuario]) return;

        statusPorUsuario[usuario].atual = numero;
        statusPorUsuario[usuario].posicao = posicao;
        statusPorUsuario[usuario].tempoRestante = tempoRestante;

        if (status === 'ok') statusPorUsuario[usuario].enviados++;
        if (status === 'falha') statusPorUsuario[usuario].falhas++;

        statusPorUsuario[usuario].restantes = statusPorUsuario[usuario].restantes.filter(n => n !== numero);
    }, controleExecucao);
}

app.get('/status/:usuario', (req, res) => {
    const { usuario } = req.params;
    const status = statusPorUsuario[usuario];
    const controle = controleExecucao[usuario];

    if (!status) return res.status(404).json({ erro: "Usuário não encontrado ou sem envio ativo." });
    res.json({ ...status, controle: controle?.status || 'desconhecido' });
});

app.post('/controle', (req, res) => {
    const { usuario, acao } = req.body;
    if (!usuario || !controleExecucao[usuario]) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário inválido." });
    }

    if (["pausar", "continuar", "parar"].includes(acao)) {
        controleExecucao[usuario].status = acao === 'continuar' ? 'executando' : acao;
        return res.json({ sucesso: true, status: controleExecucao[usuario].status });
    }

    res.status(400).json({ sucesso: false, mensagem: "Ação inválida." });
});

app.post('/deletar-sessao', (req, res) => {
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ sucesso: false, mensagem: "Usuário não informado" });

    const pasta = path.join(__dirname, 'whatsapp-sessions', usuario);
    fs.rm(pasta, { recursive: true, force: true }, (err) => {
        if (err) return res.status(500).json({ sucesso: false, mensagem: "Erro ao deletar pasta" });
        return res.json({ sucesso: true, mensagem: "Sessão deletada com sucesso" });
    });
});

app.get('/baixar-relatorio/:tipo/:usuario', (req, res) => {
    const { tipo, usuario } = req.params;
    const caminho = path.join(__dirname, `${tipo}-${usuario}.txt`);
    if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado');
    res.download(caminho);
});
// Adiciona rota para verificar se a sessão está conectada
app.get('/testar-conexao/:usuario', async (req, res) => {
    const { usuario } = req.params;
    try {
        const pasta = path.join(__dirname, 'whatsapp-sessions', usuario);
        const perfilExiste = fs.existsSync(path.join(pasta, 'Default'));

        if (!perfilExiste) {
            return res.json({ conectado: false });
        }

        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            userDataDir: pasta,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto('https://web.whatsapp.com');

        let conectado = false;
        try {
            await page.waitForSelector("div[title='Caixa de texto para digitar uma mensagem']", { timeout: 15000 });
            conectado = true;
        } catch (e) {
            conectado = false;
        }

        await browser.close();
        res.json({ conectado });

    } catch (err) {
        console.error("Erro ao testar conexão:", err);
        res.status(500).json({ conectado: false });
    }
});


const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server rodando em: http://localhost:${PORT}/index.html`));
