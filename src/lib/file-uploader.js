import {BitmapAdapter, sanitizeSvg, fixForVanilla} from '@turbowarp/scratch-svg-renderer';
import randomizeSpritePosition from './randomize-sprite-position.js';
import bmpConverter from './bmp-converter';
import gifDecoder from './gif-decoder';
import convertAudioToWav from './tw-convert-audio-wav.js';
import log from './log.js';

/**
 * When enabled, SVG sanitization (DOMPurify) will be skipped during costume upload.
 * This allows importing complex/valid SVGs that the sanitizer would otherwise strip.
 * Controlled by the "Compatible with All SVG" advanced setting.
 */
let compatibleSvgMode = false;

const setCompatibleSvgMode = function (enabled) {
    compatibleSvgMode = !!enabled;
};

// ── SVG Security Enhancement ──────────────────────────────────
// 危险元素列表
const DANGEROUS_SVG_ELEMENTS = [
    'script', 'foreignObject', 'iframe', 'html', 'body',
    'use', 'animate', 'animateMotion', 'animateTransform',
    'set', 'discard', 'audio', 'video', 'source'
];

// 危险属性列表（事件处理）
const DANGEROUS_SVG_ATTRIBUTES = [
    'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmousedown', 'onmouseup',
    'onmousemove', 'onmouseenter', 'onmouseleave', 'onfocus', 'onblur',
    'onkeydown', 'onkeyup', 'onkeypress', 'onsubmit', 'onreset',
    'onchange', 'onselect', 'onabort', 'onerror', 'ontimeout',
    'onfinish', 'onstart', 'onrepeat', 'onbegin', 'onend',
    'onactivate', 'onfocusin', 'onfocusout'
];

/**
 * 分析 SVG 的安全性
 * @param {ArrayBuffer|Uint8Array|string} svgData - SVG 数据
 * @returns {Object} 安全分析结果
 */
const analyzeSvgSecurity = function (svgData) {
    const result = {
        safe: true,
        dangers: [],
        warnings: [],
        info: [],
        externalResources: []
    };

    try {
        // 转换为字符串
        let svgString;
        if (typeof svgData === 'string') {
            svgString = svgData;
        } else if (svgData instanceof Uint8Array) {
            svgString = new TextDecoder().decode(svgData);
        } else if (svgData instanceof ArrayBuffer) {
            svgString = new TextDecoder().decode(new Uint8Array(svgData));
        } else {
            result.safe = false;
            result.dangers.push('Unknown SVG data format');
            return result;
        }

        // 快速字符串检测（在解析之前）
        const lowerSvg = svgString.toLowerCase();
        
        // 检测 script 标签
        if (lowerSvg.includes('<script') || lowerSvg.includes('&lt;script')) {
            result.safe = false;
            result.dangers.push('Embedded script tag detected');
        }

        // 检测 javascript: 协议
        if (lowerSvg.includes('javascript:')) {
            result.safe = false;
            result.dangers.push('javascript: URL scheme detected');
        }

        // 检测 data:text/html
        if (lowerSvg.includes('data:text/html')) {
            result.safe = false;
            result.dangers.push('HTML data URL detected');
        }

        // 检测外部资源
        const urlMatches = svgString.match(/(href|xlink:href|src)\s*=\s*["']([^"']+)["']/gi);
        if (urlMatches) {
            urlMatches.forEach(match => {
                const urlMatch = match.match(/["']([^"']+)["']/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (!url.startsWith('data:') && !url.startsWith('#') && 
                        !url.startsWith('./') && !url.startsWith('/')) {
                        result.externalResources.push(url);
                        if (!result.warnings.includes('External resource references detected')) {
                            result.warnings.push('External resource references detected');
                        }
                    }
                }
            });
        }

        // 检测事件处理属性
        let eventAttrCount = 0;
        DANGEROUS_SVG_ATTRIBUTES.forEach(attr => {
            const regex = new RegExp('\\s' + attr + '\\s*=', 'gi');
            const matches = svgString.match(regex);
            if (matches) {
                eventAttrCount += matches.length;
            }
        });
        if (eventAttrCount > 0) {
            result.safe = false;
            result.dangers.push(`Event handler attributes detected: ${eventAttrCount}`);
        }

        // 检测 foreignObject
        if (lowerSvg.includes('<foreignobject') || lowerSvg.includes('&lt;foreignobject')) {
            result.safe = false;
            result.dangers.push('foreignObject element detected (can embed arbitrary HTML)');
        }

        // 文件大小检查
        const size = svgString.length;
        if (size > 5 * 1024 * 1024) { // 5MB
            result.warnings.push(`Large SVG file: ${(size / 1024 / 1024).toFixed(2)} MB`);
        }

        result.info.push(`File size: ${(size / 1024).toFixed(1)} KB`);

    } catch (e) {
        result.safe = false;
        result.dangers.push('SVG parsing error: ' + e.message);
    }

    return result;
};

/**
 * 额外的 SVG 安全清理（第二道防线）
 * 在 sanitizeSvg 之后再做一次清理，确保没有遗漏
 * @param {ArrayBuffer|Uint8Array} svgData - SVG 数据
 * @returns {Uint8Array} 清理后的 SVG 数据
 */
const extraSvgSanitize = function (svgData) {
    try {
        let svgString;
        if (svgData instanceof Uint8Array) {
            svgString = new TextDecoder().decode(svgData);
        } else if (svgData instanceof ArrayBuffer) {
            svgString = new TextDecoder().decode(new Uint8Array(svgData));
        } else {
            return svgData;
        }

        // 额外的安全清理
        // 1. 移除所有 on* 事件属性
        DANGEROUS_SVG_ATTRIBUTES.forEach(attr => {
            const regex = new RegExp('\\s' + attr + '\\s*=\\s*["\'][^"\']*["\']', 'gi');
            svgString = svgString.replace(regex, '');
        });

        // 2. 移除 javascript: 链接
        svgString = svgString.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
        svgString = svgString.replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, 'xlink:href="#"');

        // 3. 移除 script 标签及其内容
        svgString = svgString.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        svgString = svgString.replace(/<script[^>]*\/>/gi, '');

        // 4. 移除 foreignObject 及其内容
        svgString = svgString.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
        svgString = svgString.replace(/<foreignObject[^>]*\/>/gi, '');

        return new TextEncoder().encode(svgString);
    } catch (e) {
        log.error('extraSvgSanitize error', e);
        return svgData;
    }
};

/**
 * Extract the file name given a string of the form fileName + ext
 * @param {string} nameExt File name + extension (e.g. 'my_image.png')
 * @return {string} The name without the extension, or the full name if
 * there was no '.' in the string (e.g. 'my_image')
 */
const extractFileName = function (nameExt) {
    // There could be multiple dots, but get the stuff before the first .
    const nameParts = nameExt.split('.', 1); // we only care about the first .
    return nameParts[0];
};

/**
 * Handle a file upload given the input element that contains the file,
 * and a function to handle loading the file.
 * @param {Input} fileInput The <input/> element that contains the file being loaded
 * @param {Function} onload The function that handles loading the file
 * @param {Function} onerror The function that handles any error loading the file
 */
const handleFileUpload = function (fileInput, onload, onerror) {
    const readFile = (i, files) => {
        if (i === files.length) {
            // Reset the file input value now that we have everything we need
            // so that the user can upload the same sound multiple times if
            // they choose
            fileInput.value = null;
            return;
        }
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
            const fileType = file.type;
            const fileName = extractFileName(file.name);
            onload(reader.result, fileType, fileName, i, files.length);
            readFile(i + 1, files);
        };
        reader.onerror = onerror;
        reader.readAsArrayBuffer(file);
    };
    readFile(0, fileInput.files);
};

/**
 * @typedef VMAsset
 * @property {string} name The user-readable name of this asset - This will
 * automatically get translated to a fresh name if this one already exists in the
 * scope of this vm asset (e.g. if a sound already exists with the same name for
 * the same target)
 * @property {string} dataFormat The data format of this asset, typically
 * the extension to be used for that particular asset, e.g. 'svg' for vector images
 * @property {string} md5 The md5 hash of the asset data, followed by '.'' and dataFormat
 * @property {string} The md5 hash of the asset data // TODO remove duplication....
 */

/**
 * Create an asset (costume, sound) with storage and return an object representation
 * of the asset to track in the VM.
 * @param {ScratchStorage} storage The storage to cache the asset in
 * @param {AssetType} assetType A ScratchStorage AssetType indicating what kind of
 * asset this is.
 * @param {string} dataFormat The format of this data (typically the file extension)
 * @param {UInt8Array} data The asset data buffer
 * @return {VMAsset} An object representing this asset and relevant information
 * which can be used to look up the data in storage
 */
const createVMAsset = function (storage, assetType, dataFormat, data) {
    const asset = storage.createAsset(
        assetType,
        dataFormat,
        data,
        null,
        true // generate md5
    );

    return {
        name: null, // Needs to be set by caller
        dataFormat: dataFormat,
        asset: asset,
        md5: `${asset.assetId}.${dataFormat}`,
        assetId: asset.assetId
    };
};

/**
 * Handles loading a costume or a backdrop using the provided, context-relevant information.
 * @param {ArrayBuffer | string} fileData The costume data to load (this can be a base64 string
 * iff the image is a bitmap)
 * @param {string} fileType The MIME type of this file
 * @param {VM} vm The ScratchStorage instance to cache the costume data
 * @param {Function} handleCostume The function to execute on the costume object returned after
 * caching this costume in storage - This function should be responsible for
 * adding the costume to the VM and handling other UI flow that should come after adding the costume
 * @param {Function} handleError The function to execute if there is an error parsing the costume
 */
const costumeUpload = function (fileData, fileType, vm, handleCostume, handleError = () => {}) {
    const storage = vm.runtime.storage;
    let costumeFormat = null;
    let assetType = null;
    switch (fileType) {
    case 'image/svg+xml': {
        // ── SVG Security Enhancement ──────────────────────────
        
        // 第一步：上传前安全检测
        const securityCheck = analyzeSvgSecurity(fileData);
        if (!securityCheck.safe) {
            log.warn('SVG Security: Potentially dangerous SVG detected', {
                dangers: securityCheck.dangers,
                warnings: securityCheck.warnings
            });
            securityCheck.dangers.forEach(danger => {
                log.warn(`SVG Security - Danger: ${danger}`);
            });
        }
        if (securityCheck.warnings.length > 0) {
            securityCheck.warnings.forEach(warning => {
                log.info(`SVG Security - Warning: ${warning}`);
            });
        }
        
        // fix any vanilla compatibility issues in the SVG first
        try {
            fileData = fixForVanilla(fileData);
        } catch (e) {
            log.error('fixForVanilla error', e);
        }

        // run svg bytes through scratch-svg-renderer's sanitization code
        // unless "Compatible with All SVG" mode is enabled
        if (!compatibleSvgMode) {
            // 第一道防线：scratch-svg-renderer 的 sanitizeSvg (DOMPurify)
            fileData = sanitizeSvg.sanitizeByteStream(fileData);
            
            // 第二道防线：额外的安全清理（双重保险）
            fileData = extraSvgSanitize(fileData);
            
            // 验证：消毒后再次检查
            const postSanitizeCheck = analyzeSvgSecurity(fileData);
            if (!postSanitizeCheck.safe) {
                log.error('SVG Security: SVG still dangerous after sanitization!', {
                    dangers: postSanitizeCheck.dangers
                });
                // 如果还有危险内容，拒绝上传
                handleError('SVG security check failed: potentially malicious SVG detected');
                return;
            }
            
            log.info('SVG Security: SVG sanitization completed successfully');
        } else {
            log.warn('SVG Security: Compatible with All SVG mode enabled - skipping sanitization');
        }

        costumeFormat = storage.DataFormat.SVG;
        assetType = storage.AssetType.ImageVector;
        break;
    }
    case 'image/jpeg': {
        costumeFormat = storage.DataFormat.JPG;
        assetType = storage.AssetType.ImageBitmap;
        break;
    }
    case 'image/bmp': {
        // Convert .bmp files to .png to compress them. .bmps are completely uncompressed,
        // and would otherwise take up a lot of storage space and take much longer to upload and download.
        bmpConverter(fileData).then(dataUrl => {
            costumeUpload(dataUrl, 'image/png', vm, handleCostume);
        });
        return; // Return early because we're triggering another proper costumeUpload
    }
    case 'image/png': {
        costumeFormat = storage.DataFormat.PNG;
        assetType = storage.AssetType.ImageBitmap;
        break;
    }
    case 'image/webp': {
        // Scratch does not natively support webp, so convert to png
        // see image/bmp logic above
        bmpConverter(fileData, 'image/webp').then(dataUrl => {
            costumeUpload(dataUrl, 'image/png', vm, handleCostume);
        });
        return;
    }
    case 'image/gif': {
        let costumes = [];
        gifDecoder(fileData, (frameNumber, dataUrl, numFrames) => {
            costumeUpload(dataUrl, 'image/png', vm, costumes_ => {
                costumes = costumes.concat(costumes_);
                if (frameNumber === numFrames - 1) {
                    handleCostume(costumes);
                }
            }, handleError);
        });
        return; // Abandon this load, do not try to load gif itself
    }
    default:
        handleError(`Encountered unexpected file type: ${fileType}`);
        return;
    }

    const bitmapAdapter = new BitmapAdapter();
    if (bitmapAdapter.setStageSize) {
        const width = vm.runtime.stageWidth;
        const height = vm.runtime.stageHeight;
        bitmapAdapter.setStageSize(width, height);
    }
    const addCostumeFromBuffer = function (dataBuffer) {
        const vmCostume = createVMAsset(
            storage,
            assetType,
            costumeFormat,
            dataBuffer
        );
        handleCostume([vmCostume]);
    };

    if (costumeFormat === storage.DataFormat.SVG) {
        // Must pass in file data as a Uint8Array,
        // passing in an array buffer causes the sprite/costume
        // thumbnails to not display because the data URI for the costume
        // is invalid
        addCostumeFromBuffer(new Uint8Array(fileData));
    } else {
        // otherwise it's a bitmap
        bitmapAdapter.importBitmap(fileData, fileType).then(addCostumeFromBuffer)
            .catch(handleError);
    }
};

/**
 * Handles loading a sound using the provided, context-relevant information.
 * @param {ArrayBuffer} fileData The sound data to load
 * @param {string} fileType The MIME type of this file; This function will exit
 * early if the fileType is unexpected.
 * @param {ScratchStorage} storage The ScratchStorage instance to cache the sound data
 * @param {Function} handleSound The function to execute on the sound object of type VMAsset
 * This function should be responsible for adding the sound to the VM
 * as well as handling other UI flow that should come after adding the sound
 * @param {Function} handleError The function to execute if there is an error parsing the sound
 */
const soundUpload = function (fileData, fileType, storage, handleSound, handleError) {
    let soundFormat;
    switch (fileType) {
    case 'audio/mp3':
    case 'audio/mpeg': {
        soundFormat = storage.DataFormat.MP3;
        break;
    }
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
    case 'audio/x-pn-wav': {
        soundFormat = storage.DataFormat.WAV;
        break;
    }
    default:
        convertAudioToWav(fileData)
            .then(fixed => {
                soundUpload(fixed, 'audio/wav', storage, handleSound, handleError);
            })
            .catch(handleError);
        return;
    }

    const vmSound = createVMAsset(
        storage,
        storage.AssetType.Sound,
        soundFormat,
        new Uint8Array(fileData));

    handleSound(vmSound);
};

const spriteUpload = function (fileData, fileType, spriteName, vm, handleSprite, handleError = () => {}) {
    switch (fileType) {
    case '':
    // scratch-vm specifies application/x.scratch.sprite3 for sprite3 files. Real packages in the
    // wild use hyphens instead of periods. We'll just support all of the reasonable variations.
    case 'application/x-scratch2-sprite':
    case 'application/x-scratch3-sprite':
    case 'application/x.scratch2.sprite':
    case 'application/x.scratch3.sprite':
    case 'application/zip': { // We think this is a .sprite2 or .sprite3 file
        handleSprite(new Uint8Array(fileData));
        return;
    }
    case 'image/svg+xml':
    case 'image/png':
    case 'image/bmp':
    case 'image/jpeg':
    case 'image/webp':
    case 'image/gif': {
        // Make a sprite from an image by making it a costume first
        costumeUpload(fileData, fileType, vm, vmCostumes => {
            vmCostumes.forEach((costume, i) => {
                costume.name = `${spriteName}${i ? i + 1 : ''}`;
            });
            const newSprite = {
                name: spriteName,
                isStage: false,
                x: 0, // x/y will be randomized below
                y: 0,
                visible: true,
                size: 100,
                rotationStyle: 'all around',
                direction: 90,
                draggable: false,
                currentCostume: 0,
                blocks: {},
                variables: {},
                costumes: vmCostumes,
                sounds: [] // TODO are all of these necessary?
            };
            randomizeSpritePosition(newSprite);
            // TODO probably just want sprite upload to handle this object directly
            handleSprite(JSON.stringify(newSprite));
        }, handleError);
        return;
    }
    default: {
        handleError(`Encountered unexpected file type: ${fileType}`);
        return;
    }
    }
};

export {
    handleFileUpload,
    costumeUpload,
    soundUpload,
    spriteUpload,
    setCompatibleSvgMode
};
