const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const app = express();

const tempDir = path.join(__dirname, 'temp_files');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const requestDir = path.join(tempDir, req.requestDir);
    if (!fs.existsSync(requestDir)) {
      fs.mkdirSync(requestDir);
    }
    cb(null, requestDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use((req, res, next) => {
  req.requestDir = uuidv4();
  next();
});

function removeFilesAfterTimeout(directory) {
  setTimeout(() => {
    fs.rm(directory, { recursive: true, force: true }, (err) => {
      if (err) throw err;
      console.log(`Diretório ${directory} removido após 30 minutos`);
    });
  }, 30 * 60 * 1000);
}

app.get('/remover', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/remover.html'));
});

app.get('/editar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/editar.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/upload/remover', upload.array('xmlFiles'), (req, res) => {
  const tagsToRemove = req.body.tagsToRemove.split(',');
  const arquivosModificados = [];
  let totalTagsRemovidas = 0;

  req.files.forEach(file => {
    let fileContent = fs.readFileSync(file.path, 'utf-8');

    tagsToRemove.forEach(tag => {
      const regex = new RegExp(`<${tag}>.*?</${tag}>`, 'g');
      const matches = fileContent.match(regex) || [];
      totalTagsRemovidas += matches.length;
      fileContent = fileContent.replace(regex, '');
    });

    const modifiedFilePath = path.join(tempDir, req.requestDir, `${file.originalname}`);
    fs.writeFileSync(modifiedFilePath, fileContent);
    arquivosModificados.push(modifiedFilePath);
  });

  const zipFileName = 'arquivos_modificados.zip';
  const zipPath = path.join(tempDir, req.requestDir, zipFileName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  arquivosModificados.forEach(file => {
    archive.append(fs.createReadStream(file), { name: path.basename(file) });
  });

  archive.finalize();

  removeFilesAfterTimeout(path.join(tempDir, req.requestDir));

  output.on('close', () => {
    res.json({
      message: 'Arquivos modificados com sucesso!',
      totalTagsRemovidas: totalTagsRemovidas,
      downloadLink: `http://localhost:3000/temp_files/${req.requestDir}/arquivos_modificados.zip`
    });
  });
});

app.post('/upload/editar', upload.array('xmlFiles'), (req, res) => {
  const tagPairs = JSON.parse(req.body.tagPairs); // Pares de tags antigas e novas
  const arquivosModificados = [];
  let totalTagsRenomeadas = 0;

  req.files.forEach(file => {
    let fileContent = fs.readFileSync(file.path, 'utf-8');

    // Renomeia as tags de acordo com os pares fornecidos
    tagPairs.forEach(({ oldTag, newTag }) => {
      const regex = new RegExp(`<${oldTag}>(.*?)</${oldTag}>`, 'g');
      const occurrences = (fileContent.match(regex) || []).length;
      fileContent = fileContent.replace(regex, `<${newTag}>$1</${newTag}>`);
      totalTagsRenomeadas += occurrences;
    });

    const modifiedFilePath = path.join(tempDir, file.filename);
    fs.writeFileSync(modifiedFilePath, fileContent);
    arquivosModificados.push(modifiedFilePath);
  });

  const zipFileName = 'arquivos_editados.zip';
  const zipPath = path.join(tempDir, zipFileName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  arquivosModificados.forEach(file => {
    archive.append(fs.createReadStream(file), { name: path.basename(file) });
  });
  archive.finalize();

  output.on('close', () => {
    res.json({
      message: 'Arquivos editados com sucesso!',
      totalTagsRenomeadas: totalTagsRenomeadas,
      downloadLink: `http://localhost:3000/${zipFileName}`
    });
  });
});


app.get('/temp_files/:requestDir/arquivos_modificados.zip', (req, res) => {
  const zipPath = path.join(tempDir, req.params.requestDir, 'arquivos_modificados.zip');
  res.download(zipPath, 'arquivos_modificados.zip', (err) => {
    if (err) {
      console.error('Erro ao baixar o arquivo:', err);
    }
  });
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
