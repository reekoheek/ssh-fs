const path = require('path');
const { spawn } = require('child_process');

class SshFs {
  constructor ({ user, host, port = 22, rootDir = '/', executable = '/usr/bin/ssh' }) {
    this.executable = executable;
    this.user = user;
    this.host = host;
    this.port = port;
    this.rootDir = rootDir;
  }

  access (p, cb) {
    (async () => {
      let realPath = path.join(this.rootDir, p);

      try {
        await this.remoteRun(`stat "${realPath}"`);
        if (cb) cb();
      } catch (err) {
        if (cb) cb(err);
      }
    })();
  }

  mkdir (p, ...args) {
    let cb = args.pop();
    (async () => {
      let realPath = path.join(this.rootDir, p);

      try {
        await this.remoteRun(`mkdir "${realPath}"`);
        if (cb) cb();
      } catch (err) {
        if (err.result) {
          if (err.result.err.toString().match(/File exists/)) {
            let err = new Error('EEXIST');
            err.code = 'EEXIST';
            return cb(err);
          }
        }

        if (cb) cb(err);
      }
    })();
  }

  rmrf (p, cb) {
    (async () => {
      let realPath = path.join(this.rootDir, p);
      try {
        await this.remoteRun(`rm -rf "${realPath}"`);
        if (cb) cb();
      } catch (err) {
        if (cb) cb(err);
      }
    })();
  }

  writeFile (p, content, cb) {
    (async () => {
      let realPath = path.join(this.rootDir, p);
      try {
        await this.remoteRun(`cat > "${realPath}"`, content);
        if (cb) cb();
      } catch (err) {
        if (cb) cb(err);
      }
    })();
  }

  readdir (p, cb) {
    (async () => {
      let realPath = path.join(this.rootDir, p);
      try {
        let result = await this.remoteRun(`ls "${realPath}"`);
        let files = [];
        result.out.toString().split('\n').forEach(token => {
          token = token.trim();
          if (token) {
            files.push(token);
          }
        });
        if (cb) cb(null, files);
      } catch (err) {
        if (cb) cb(err);
      }
    })();
  }

  remoteRun (line, input) {
    return new Promise((resolve, reject) => {
      let options = [
        '-o',
        'StrictHostKeyChecking no',
        '-p',
        this.port,
        `${this.user}@${this.host}`,
        '--',
        line,
      ];

      let proc = spawn(this.executable, options);

      let outChunks = [];
      let errChunks = [];
      proc.stdout.on('data', chunk => outChunks.push(chunk));
      proc.stderr.on('data', chunk => errChunks.push(chunk));
      proc.on('exit', (code, signal) => {
        let result = {
          out: Buffer.concat(outChunks),
          err: Buffer.concat(errChunks),
        };

        if (code) {
          let err = new Error(`Remote run exit with code: ${code}`);
          err.result = result;
          err.code = code;
          err.signal = signal;
          reject(err);
          return;
        }

        resolve(result);
      });

      if (input) {
        proc.stdin.write(input);
        proc.stdin.end();
      }
    });
  }
}

module.exports = SshFs;
