let usuarios = [];
let intervaloMonitoramento = null;
let historico = [];
let estadoExpansao = {};

// Salvar e carregar expansão
function salvarEstadoExpansao() {
    localStorage.setItem('estadoExpansao', JSON.stringify(estadoExpansao));
}
function carregarEstadoExpansao() {
    const data = localStorage.getItem('estadoExpansao');
    if (data) estadoExpansao = JSON.parse(data);
}

// Salvar e carregar usuários
function salvarNoStorage() {
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}
function carregarDoStorage() {
    const data = localStorage.getItem('usuarios');
    if (data) {
        usuarios = JSON.parse(data);
        renderizarUsuarios();
        preencherDropdownStatus();
    }
}

// Adicionar usuário
function adicionarUsuario() {
    const nome = document.getElementById('novoUsuario').value.trim();
    if (nome && !usuarios.find(u => u.nome === nome)) {
        usuarios.push({ nome, numeros: '', mensagem: '' });
        document.getElementById('novoUsuario').value = '';
        salvarNoStorage();
        renderizarUsuarios();
        preencherDropdownStatus();
    }
}

// Renderizar caixas de usuário
function renderizarUsuarios() {
    const container = document.getElementById('usuariosContainer');
    container.innerHTML = '';

    usuarios.forEach((u, i) => {
        const box = document.createElement('div');
        box.className = 'usuario-box';

        const conteudoAberto = estadoExpansao[u.nome] ?? false;

        box.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 onclick="toggleConteudo(${i})" id="titulo-${i}">WhatsApp ${u.nome} ⬇</h3>
                <button onclick="deletarUsuario(${i})" style="max-width: 100px; background-color: red; font-size: 0.8rem;">❌ Deletar</button>
            </div>
            <div id="conteudo-${i}" class="usuario-conteudo" style="display: ${conteudoAberto ? 'block' : 'none'};">
                <label>Números para envio (um por linha):</label>
                <textarea onchange="atualizarCampo(${i}, 'numeros', this.value)">${u.numeros}</textarea>
                <label>Mensagem:</label>
                <textarea onchange="atualizarCampo(${i}, 'mensagem', this.value)">${u.mensagem}</textarea>
            </div>
        `;

        container.appendChild(box);

        // Atualizar status de conexão
        fetch(`http://localhost:3000/status/${u.nome}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const h3 = document.getElementById(`titulo-${i}`);
                const icone = data && data.status !== 'desconectado' ? '🟢 Conectado' : '🔴 Desconectado';
                h3.innerHTML = `WhatsApp ${u.nome} ⬇ <span style="font-size:0.8rem;">${icone}</span>`;
            })
            .catch(() => {
                const h3 = document.getElementById(`titulo-${i}`);
                h3.innerHTML = `WhatsApp ${u.nome} ⬇ <span style="font-size:0.8rem;">🔴 Desconectado</span>`;
            });
    });
}

function toggleConteudo(index) {
    const usuario = usuarios[index].nome;
    const conteudo = document.getElementById(`conteudo-${index}`);
    const visivel = conteudo.style.display === 'block';
    conteudo.style.display = visivel ? 'none' : 'block';
    estadoExpansao[usuario] = !visivel;
    salvarEstadoExpansao();
}

function atualizarCampo(index, campo, valor) {
    usuarios[index][campo] = valor;
    salvarNoStorage();
}

async function deletarUsuario(index) {
    const usuario = usuarios[index].nome;
    if (!confirm(`Tem certeza que deseja deletar ${usuario}?`)) return;

    usuarios.splice(index, 1);
    salvarNoStorage();
    renderizarUsuarios();
    preencherDropdownStatus();

    await fetch('http://localhost:3000/deletar-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario })
    });

    alert(`Sessão de ${usuario} deletada.`);
}

async function baixarRelatorio(tipo, usuario) {
    const link = document.createElement('a');
    link.href = `http://localhost:3000/baixar-relatorio/${tipo}/${usuario}`;
    link.download = `${tipo}-${usuario}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

enviarMensagens = async function () {
    const intervaloMin = document.getElementById('intervaloMin').value * 1000;
    const intervaloMax = document.getElementById('intervaloMax').value * 1000;

    for (const u of usuarios) {
        const numeros = u.numeros.split('\n').map(n => n.trim()).filter(n => n);
        const mensagem = u.mensagem.trim();
        if (numeros.length === 0 || !mensagem) continue;

        await fetch('http://localhost:3000/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numeros,
                mensagem,
                intervaloMin,
                intervaloMax,
                usuarios: [u.nome]
            })
        });
    }

    alert('Disparos iniciados!');
};

function mostrarSecao(secao) {
    document.getElementById('secao-envio').style.display = secao === 'envio' ? 'block' : 'none';
    document.getElementById('secao-status').style.display = secao === 'status' ? 'block' : 'none';
}

function preencherDropdownStatus() {
    const select = document.getElementById('monitorSelecionado');
    select.innerHTML = '<option value="">-- Escolha --</option>';
    usuarios.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.nome;
        opt.textContent = `WhatsApp ${u.nome}`;
        select.appendChild(opt);
    });
}

function iniciarMonitoramento() {
    const usuario = document.getElementById('monitorSelecionado').value;
    if (!usuario) return;

    if (intervaloMonitoramento) clearInterval(intervaloMonitoramento);

    intervaloMonitoramento = setInterval(async () => {
        try {
            const res = await fetch(`http://localhost:3000/status/${usuario}`);
            if (!res.ok) throw new Error("Erro na requisição de status");
            const data = await res.json();

            // Verificar status de conexão real
            let statusConexao = '🔴 Desconectado';
            try {
                const conexao = await fetch(`http://localhost:3000/testar-conexao/${usuario}`);
                if (conexao.ok) {
                    const cData = await conexao.json();
                    if (cData.conectado) statusConexao = '🟢 Conectado';
                }
            } catch (e) {
                statusConexao = '🔴 Desconectado';
            }

            const porcentagem = data.total ? Math.floor((data.posicao / data.total) * 100) : 0;
            document.getElementById('barraProgresso').style.width = `${porcentagem}%`;

            let statusTexto = 'executando';
            let corStatus = 'gold';
            if (data.controle === 'pausar') {
                statusTexto = '⏸️ Pausado';
                corStatus = 'orange';
            } else if (data.controle === 'parar') {
                statusTexto = '⛔ Parado';
                corStatus = 'red';
            } else if (data.controle === 'executando') {
                statusTexto = '▶️ Enviando';
                corStatus = 'limegreen';
            }

            const status = `
                <strong>WhatsApp:</strong> ${usuario} <span style="font-size: 0.9rem;">${statusConexao}</span><br>
                <strong>Mensagem:</strong> ${data.mensagem}<br>
                <strong>Status:</strong> <span style="color:${corStatus}">${statusTexto}</span><br>
                <strong>Total:</strong> ${data.total}<br>
                <strong>Enviados:</strong> ${data.enviados}<br>
                <strong>Falhas:</strong> ${data.falhas}<br>
                <strong>Restantes:</strong> ${data.restantes.length}<br>
                <strong>Posição atual:</strong> ${data.posicao} de ${data.total}<br>
                <strong>Tempo até próximo envio:</strong> ${data.tempoRestante || 0}s<br>
                <strong>Enviando agora:</strong> ${data.atual || 'aguardando...'}<br><br>
                <div class="status-buttons">
                    <button onclick="enviarComando('${usuario}', 'pausar')" style="background:goldenrod;">⏸️ Pausar</button>
                    <button onclick="enviarComando('${usuario}', 'continuar')" style="background:limegreen;">▶️ Continuar</button>
                    <button onclick="enviarComando('${usuario}', 'parar')" style="background:red;">⛔ Parar</button>
                    <br><br>
                    <button onclick="baixarRelatorio('enviados', '${usuario}')" style="background:#444;">📥 Baixar Enviados</button>
                    <button onclick="baixarRelatorio('falhas', '${usuario}')" style="background:#444;">📥 Baixar Falhas</button>
                    <button onclick="baixarRelatorio('nao_enviados', '${usuario}')" style="background:#444;">📥 Baixar Não Enviados</button>
                </div>
            `;

            document.getElementById('statusContainer').innerHTML = status;

            if (data.atual && !historico.includes(data.atual)) {
                historico.push(data.atual);
                const item = document.createElement('li');
                item.textContent = `${data.posicao} - ${data.atual}`;
                document.getElementById('historicoEnvios').appendChild(item);
            }
        } catch (err) {
            console.warn("Erro ao buscar status:", err);
        }
    }, 2000);
}

window.iniciarMonitoramento = iniciarMonitoramento;
// Atualização para tornar os botões de controle funcionais com retorno visual
async function enviarComando(usuario, acao) {
    const botaoPausar = document.querySelector(`button[onclick="enviarComando('${usuario}', 'pausar')"]`);
    const botaoContinuar = document.querySelector(`button[onclick="enviarComando('${usuario}', 'continuar')"]`);
    const botaoParar = document.querySelector(`button[onclick="enviarComando('${usuario}', 'parar')"]`);

    if (!usuario) return;

    const res = await fetch('http://localhost:3000/controle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, acao })
    });

    if (res.ok) {
        const status = await res.json();

        // Reset estilos
        botaoPausar.style.opacity = '0.6';
        botaoContinuar.style.opacity = '0.6';
        botaoParar.style.opacity = '0.6';

        if (acao === 'pausar') botaoPausar.style.opacity = '1';
        if (acao === 'continuar') botaoContinuar.style.opacity = '1';
        if (acao === 'parar') botaoParar.style.opacity = '1';

        console.log(`✅ Ação "${acao}" enviada para ${usuario}`);
    } else {
        alert('❌ Falha ao enviar comando.');
    }
}

window.enviarComando = enviarComando;


async function enviarComando(usuario, acao) {
    await fetch('http://localhost:3000/controle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, acao })
    });
}

function limparHistorico() {
    historico = [];
    document.getElementById('historicoEnvios').innerHTML = '';
}

window.onload = () => {
    carregarDoStorage();
    carregarEstadoExpansao();
    mostrarSecao('envio');
};

// Garantir que funções estejam disponíveis globalmente para os botões HTML
window.enviarMensagens = enviarMensagens;
window.adicionarUsuario = adicionarUsuario;
window.mostrarSecao = mostrarSecao;
window.limparHistorico = limparHistorico;
window.iniciarMonitoramento = iniciarMonitoramento;
