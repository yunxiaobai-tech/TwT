const defaultsDeep = require('lodash.defaultsdeep');
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// 代码混淆（仅生产构建启用）：webpack-obfuscator。
// 依赖未安装时静默跳过；这样即便没装插件，dev / build 也不受影响。
let JavaScriptObfuscator = null;
try {
    JavaScriptObfuscator = require('webpack-obfuscator');
} catch (e) {
    JavaScriptObfuscator = null;
}
// 仅混淆 TwT 自有源码（exclude node_modules），并只注入到 editor 构建（不碰 dist 库的导出面）。
// 选项保守：开启字符串加密（藏住内置 API Key 明文）+ 标识符混淆，但不做控制流扁平化 /
// 全局重命名 / 死代码注入 / 反调试，避免破坏 React 与 TwT 自有代码的运行时行为。
let obfuscatorPlugin = null;
if (process.env.NODE_ENV === 'production' && JavaScriptObfuscator) {
    obfuscatorPlugin = new JavaScriptObfuscator({
        stringArray: true,
        stringArrayThreshold: 1,
        rotateStringArray: true,
        unicodeEscapeSequence: true,
        renameGlobals: false,
        selfDefending: false,
        disableConsoleOutput: false,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false
    }, ['node_modules']);
}

// ---------------------------------------------------------------------------
// TwT 内置 Key 构建期混淆（零依赖，无需 webpack-obfuscator）。
// 本沙箱环境的 npm 无法安装 webpack-obfuscator（Windows 上 npm 读取系统证书库时
// spawn powershell 超时），故改用以下纯 build-time 方案：
//   在 editor 生产构建产物里，把明文 BUILTIN_API_KEY 字面量替换为一个“运行时自解码”
//   的 IIFE（base64 + XOR 0x5A）。最终 js bundle 中不再出现可被 grep 的明文 key。
//   源码保持干净（key 仍以明文写在 src/lib/tw-feedback-ai.js，仅产物被改写）。
//   若日后能在正常机器上装好 webpack-obfuscator，上面的 obfuscatorPlugin 会自动接力
//   做整包混淆，本插件与之互不冲突（本插件先跑，产物里已无明文 key）。
// ---------------------------------------------------------------------------
const TW_FEEDBACK_AI_SRC = path.resolve(__dirname, 'src/lib/tw-feedback-ai.js');
let TW_PLAIN_KEY = '';
try {
    const src = fs.readFileSync(TW_FEEDBACK_AI_SRC, 'utf8');
    const m = src.match(/BUILTIN_API_KEY\s*=\s*'([^']+)'/);
    if (m) TW_PLAIN_KEY = m[1];
} catch (e) { /* ignore */ }

function twEncodeKey (plain) {
    // 逐字符 XOR 0x5A 后做 base64；结果仅含 A-Za-z0-9+/=，可安全放进 JS 字符串字面量。
    return Buffer.from([].map.call(plain, c => c.charCodeAt(0) ^ 0x5A)).toString('base64');
}

class TwKeyObfuscatorPlugin {
    apply (compiler) {
        compiler.hooks.emit.tap('TwKeyObfuscatorPlugin', (compilation) => {
            if (!TW_PLAIN_KEY) return;
            const encoded = twEncodeKey(TW_PLAIN_KEY);
            // 运行时自解码：不依赖任何外部变量/全局；try/catch 保证即使异常也只返回空串而非崩溃。
            const replacement =
                `(function(){try{var b=atob("${encoded}");var s="";for(var i=0;i<b.length;i++){s+=String.fromCharCode(b.charCodeAt(i)^0x5A);}return s;}catch(_){return "";}})()`;
            Object.keys(compilation.assets).forEach((file) => {
                if (!/\.js$/.test(file)) return;
                let src = compilation.assets[file].source();
                if (typeof src !== 'string') src = src.toString('utf8');
                if (src.indexOf(TW_PLAIN_KEY) === -1) return;
                src = src.split(TW_PLAIN_KEY).join(replacement);
                compilation.assets[file] = {
                    source: () => src,
                    size: () => src.length
                };
            });
        });
    }
}

// 仅生产构建 + 能解析到 key 时启用；dev / 库构建不受影响。
const twKeyPlugin = (process.env.NODE_ENV === 'production' && TW_PLAIN_KEY) ? new TwKeyObfuscatorPlugin() : null;

// PostCss
const autoprefixer = require('autoprefixer');
const postcssVars = require('postcss-simple-vars');
const postcssImport = require('postcss-import');

const STATIC_PATH = process.env.STATIC_PATH || '/static';
const {APP_NAME} = require('./src/lib/brand');

const root = process.env.ROOT || '';
if (root.length > 0 && !root.endsWith('/')) {
    throw new Error('If ROOT is defined, it must have a trailing slash.');
}

const htmlWebpackPluginCommon = {
    root: root,
    meta: JSON.parse(process.env.EXTRA_META || '{}'),
    APP_NAME
};

// When this changes, the path for all JS files will change, bypassing any HTTP caches
const CACHE_EPOCH = 'pentapod';

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.SOURCEMAP || (process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map'),
    devServer: {
        contentBase: path.resolve(__dirname, 'build'),
        host: '0.0.0.0',
        disableHostCheck: true,
        compress: true,
        port: process.env.PORT || 8601,
        // allows ROUTING_STYLE=wildcard to work properly
        historyApiFallback: {
            rewrites: [
                {from: /^\/\d+\/?$/, to: '/index.html'},
                {from: /^\/\d+\/fullscreen\/?$/, to: '/fullscreen.html'},
                {from: /^\/\d+\/editor\/?$/, to: '/editor.html'},
                {from: /^\/\d+\/embed\/?$/, to: '/embed.html'},
                {from: /^\/addons\/?$/, to: '/addons.html'}
            ]
        }
    },
    output: {
        library: 'GUI',
        filename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        chunkFilename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        publicPath: root
    },
    resolve: {
        symlinks: false,
        alias: {
            'text-encoding$': path.resolve(__dirname, 'src/lib/tw-text-encoder'),
            'scratch-render-fonts$': path.resolve(__dirname, 'src/lib/tw-scratch-render-fonts')
        }
    },
    module: {
        rules: [{
            test: /\.jsx?$/,
            loader: 'swc-loader',
            include: [
                path.resolve(__dirname, 'src'),
                /node_modules[\\/]scratch-[^\\/]+[\\/]src/,
                /node_modules[\\/]pify/,
                /node_modules[\\/]@vernier[\\/]godirect/
            ],
            options: {
                // SWC (Rust) 转译，替代 babel-loader：dev 启动/HMR 大幅提速。
                // react 用 classic 运行时（TwT 未启用新 JSX transform）。
                // 浏览器目标对齐 .browserslistrc，等价于原 @babel/preset-env。
                // 注：react-intl 文案抽取不在此处进行，由 `npm run i18n:src`
                // （babel CLI + 根 .babelrc）独立兜底，详见 package.json。
                jsc: {
                    parser: {
                        syntax: 'ecmascript',
                        jsx: true
                    },
                    transform: {
                        react: {
                            runtime: 'classic'
                        }
                    }
                },
                env: {
                    targets: fs
                        .readFileSync(path.resolve(__dirname, '.browserslistrc'), 'utf8')
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean)
                }
            }
        },
        {
            test: /\.css$/,
            use: [{
                loader: 'style-loader'
            }, {
                loader: 'css-loader',
                options: {
                    modules: true,
                    importLoaders: 1,
                    localIdentName: '[name]_[local]_[hash:base64:5]',
                    camelCase: true
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    ident: 'postcss',
                    plugins: function () {
                        return [
                            postcssImport,
                            postcssVars,
                            autoprefixer
                        ];
                    }
                }
            }]
        }]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/default'
                },
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/high-contrast'
                },
                {
                    from: 'src/lib/themes/blocks/high-contrast-media/blocks-media',
                    to: 'static/blocks-media/high-contrast',
                    force: true
                }
            ]
        })
    ]
};

if (!process.env.CI) {
    base.plugins.push(new webpack.ProgressPlugin());
}

module.exports = [
    // to run editor examples
    defaultsDeep({}, base, {
        entry: {
            'editor': './src/playground/editor.jsx',
            'player': './src/playground/player.jsx',
            'fullscreen': './src/playground/fullscreen.jsx',
            'embed': './src/playground/embed.jsx',
            'addon-settings': './src/playground/addon-settings.jsx',
            'credits': './src/playground/credits/credits.jsx',
            'changelog': './src/playground/changelog/changelog.jsx'
        },
        output: {
            path: path.resolve(__dirname, 'build')
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: /\.(svg|png|wav|mp3|gif|jpg|woff2|hex|otf)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 2048,
                        outputPath: 'static/assets/',
                        esModule: false
                    }
                }
            ])
        },
        optimization: {
            splitChunks: {
                chunks: 'all',
                minChunks: 2,
                minSize: 50000,
                maxInitialRequests: 5
            }
        },
        plugins: base.plugins.concat([
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
                'process.env.DEBUG': Boolean(process.env.DEBUG),
                'process.env.ENABLE_SERVICE_WORKER': JSON.stringify(process.env.ENABLE_SERVICE_WORKER || ''),
                'process.env.ROOT': JSON.stringify(root),
                'process.env.ROUTING_STYLE': JSON.stringify(process.env.ROUTING_STYLE || 'filehash'),
                'process.env.ENABLE_WINDCHIMES': JSON.stringify(process.env.ENABLE_WINDCHIMES || '')
            }),
            new HtmlWebpackPlugin({
                chunks: ['editor'],
                template: 'src/playground/index.ejs',
                filename: 'editor.html',
                title: 'TwT - 让TurboWarp更加舒适',
                isEditor: true,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['player'],
                template: 'src/playground/index.ejs',
                filename: 'index.html',
                title: 'TwT - 让TurboWarp更加舒适',
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['fullscreen'],
                template: 'src/playground/index.ejs',
                filename: 'fullscreen.html',
                title: 'TwT - 让TurboWarp更加舒适',
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['embed'],
                template: 'src/playground/embed.ejs',
                filename: 'embed.html',
                title: `Embedded Project - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['addon-settings'],
                template: 'src/playground/simple.ejs',
                filename: 'addons.html',
                title: `Addon Settings - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['credits'],
                template: 'src/playground/simple.ejs',
                filename: 'credits.html',
                title: `${APP_NAME} Credits`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['changelog'],
                template: 'src/playground/simple.ejs',
                filename: 'changelog.html',
                title: `${APP_NAME} 更新日志`,
                ...htmlWebpackPluginCommon
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'static',
                        to: ''
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'extensions/**',
                        to: 'static',
                        context: 'src/examples'
                    }
                ]
            }),
            ...(obfuscatorPlugin ? [obfuscatorPlugin] : []),
            ...(twKeyPlugin ? [twKeyPlugin] : [])
        ])
    })
].concat(
    process.env.NODE_ENV === 'production' || process.env.BUILD_MODE === 'dist' ? (
        // export as library
        defaultsDeep({}, base, {
            target: 'web',
            entry: {
                'scratch-gui': './src/index.js'
            },
            output: {
                libraryTarget: 'umd',
                filename: 'js/[name].js',
                chunkFilename: 'js/[name].js',
                path: path.resolve('dist'),
                publicPath: `${STATIC_PATH}/`
            },
            externals: {
                'react': 'react',
                'react-dom': 'react-dom'
            },
            module: {
                rules: base.module.rules.concat([
                    {
                        test: /\.(svg|png|wav|mp3|gif|jpg|woff2|hex|otf)$/,
                        loader: 'url-loader',
                        options: {
                            limit: 2048,
                            outputPath: 'static/assets/',
                            publicPath: `${STATIC_PATH}/assets/`,
                            esModule: false
                        }
                    }
                ])
            },
            plugins: base.plugins.concat([
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'extension-worker.{js,js.map}',
                            context: 'node_modules/scratch-vm/dist/web',
                            noErrorOnMissing: true
                        }
                    ]
                }),
                // Include library JSON files for scratch-desktop to use for downloading
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'src/lib/libraries/*.json',
                            to: 'libraries',
                            flatten: true
                        }
                    ]
                })
            ])
        })) : []
);
