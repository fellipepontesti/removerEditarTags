const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const app = express();

// Definindo a pasta temporária onde os arquivos serão salvos
const tempDir = path.join(__dirname, 'temp_files'); // Garante que a pasta esteja no diretório raiz do projeto

// Função para garantir que a pasta temporária exista
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir); // Cria a pasta temp_files se não existir
}

// Configuração do multer para armazenamento temporário
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir); // Arquivos enviados são salvos na pasta temp_files
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`); // Renomeia os arquivos para evitar conflitos
  }
});

const upload = multer({ storage: storage });

// Função para remover arquivos após 30 minutos
function removeFilesAfterTimeout() {
  setTimeout(() => {
    fs.readdir(tempDir, (err, files) => {
      if (err) throw err;

      files.forEach(file => {
        const filePath = path.join(tempDir, file);
        fs.unlink(filePath, (err) => {
          if (err) throw err;
          console.log(`Arquivo ${file} removido após 30 minutos`);
        });
      });
    });
  }, 30 * 60 * 1000); // 30 minutos em milissegundos
}

// Rota para servir a página HTML principal (/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html')); // Serve o arquivo HTML
});

// Rota para o upload dos arquivos XML
app.post('/upload', upload.array('xmlFiles'), (req, res) => {
  const tagsToRemove = req.body.tagsToRemove.split(','); // Tags a remover
  const arquivosModificados = [];
  const totalTagsRemovidas = 5; // Exemplo de número de tags removidas
  
  req.files.forEach(file => {
    // Exemplo de modificação simples nos arquivos (remover tags do XML)
    let fileContent = fs.readFileSync(file.path, 'utf-8');
    
    // Remover as tags desejadas
    tagsToRemove.forEach(tag => {
      const regex = new RegExp(`<${tag}>.*?</${tag}>`, 'g');
      fileContent = fileContent.replace(regex, ''); // Removendo as tags
    });

    // Salvar o arquivo modificado na pasta temporária (temp_files)
    const modifiedFilePath = path.join(tempDir, `modified_${file.filename}`);
    fs.writeFileSync(modifiedFilePath, fileContent);
    arquivosModificados.push(modifiedFilePath); // Adiciona o arquivo modificado à lista
  });

  // Gerar o arquivo ZIP com os arquivos modificados
  const zipFileName = 'arquivos_modificados.zip';
  const zipPath = path.join(tempDir, zipFileName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  // Adicionar os arquivos modificados ao ZIP
  arquivosModificados.forEach(file => {
    archive.append(fs.createReadStream(file), { name: path.basename(file) });
  });

  archive.finalize();

  // Remover os arquivos após 30 minutos
  removeFilesAfterTimeout();

  // Enviar a resposta com o link para download
  output.on('close', () => {
    res.json({
      message: 'Arquivos modificados com sucesso!',
      totalTagsRemovidas: totalTagsRemovidas,
      downloadLink: `http://localhost:3000/arquivos_modificados.zip`
    });
  });
});

// Rota para servir os arquivos ZIP para download
app.get('/arquivos_modificados.zip', (req, res) => {
  const zipPath = path.join(tempDir, 'arquivos_modificados.zip');
  res.download(zipPath, 'arquivos_modificados.zip', (err) => {
    if (err) {
      console.error('Erro ao baixar o arquivo:', err);
    }
  });
});

// Iniciar o servidor
app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
