import url from 'url';
import webpack from 'webpack';

import { ServerManifest } from './types.js';

const PLUGIN_NAME = 'React Flight Webpack Server Plugin';

class WebpackPlugin {

  constructor() {
    this.serverManifestFilename = 'react-server-manifest.json';
  }

  serverManifestFilename: string;

  apply(compiler: webpack.Compiler) {

    const _this = this;

    compiler.hooks.make.tap(PLUGIN_NAME, compilation => {

      compilation.hooks.processAssets.tap({
        name: PLUGIN_NAME,
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
      }, () => {

        const serverManifest: ServerManifest = {};

        compilation.chunkGroups.forEach(function (chunkGroup) {

          const chunks: string[] = [];
          for (const chunk of chunkGroup.chunks) {
            for (const file of chunk.files) {
              chunks.push(String(chunk.id), file);
            }
          }

          function recordModule(id: string, module: webpack.Module) {
            if (module instanceof webpack.NormalModule) {
              const href = url.pathToFileURL(module.resource).href;

              if (href !== undefined) {
                serverManifest[href] = {
                  id,
                  chunks,
                  name: '*',
                };
              }
            }
          }

          for (const chunk of chunkGroup.chunks) {
            for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {

              const moduleId = compilation.chunkGraph.getModuleId(module);

              recordModule(String(moduleId), module);
              // If this is a concatenation, register each child to the parent ID.
              // if (module.modules) {
              //   module.modules.forEach(concatenatedMod => {
              //     recordModule(moduleId, concatenatedMod);
              //   });
              // }
            }
          }

          const serverManifestOutput = JSON.stringify(serverManifest, null, 2);
          compilation.emitAsset(
            _this.serverManifestFilename,
            new webpack.sources.RawSource(serverManifestOutput, false),
          );
        });
      });
    });
  }
}

export = WebpackPlugin;
