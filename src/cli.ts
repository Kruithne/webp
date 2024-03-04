import fs from 'node:fs';
import path from 'node:path';

const ANSI_RED = '\x1b[31m';
const ANSI_CYAN = '\x1b[36m';

function format_colors(text: string, color_code: string): string {
	return text.replace(/\{(.+?)\}/g, color_code + '$1\x1b[0m');
}

function print_error(message: string): void {
	console.error(format_colors('{Error}: ' + message, ANSI_RED));
}

function print_info(message: string): void {
	console.log(format_colors(message, ANSI_CYAN));
}

function print_usage(): void {
	print_info('{Usage}: webp <{input}> [{options}]');
	print_info('	{ext}={png,jpg}		Extensions to convert (if input is a directory).');
	print_info('	{out}={/path/to/output}	Output directory (defaults to source directory)');
	print_info('	{quality}={75}		Image quality (0-100) for lossy compression.');
	print_info('	{lossless}		Use lossless compression.');
	print_info('	{compression}={6}		Compression level (0-6) for lossy compression.');
	print_info('	{scale}={0.5}		Scale image by factor (0.5 = 50%).');
	print_info('	{width}={960}|{source}|{auto}	Resize image to width, defaults to auto width.');
	print_info('	{height}={540}|{source}|{auto}	Resize image to height, defaults to auto height.');
	print_info('	{crop}			Enable cropping (instead of resize).');
	print_info('	{centerh}			Center crop horizontally.');
	print_info('	{centerv}			Center crop vertically.');
	print_info('	{center}			Center crop horizontally and vertically.');
	print_info('	{verbose}			Enable verbose output.');
}

function panic(message: string): void {
	print_error(message);
	process.exit(1);
}

function safe(fn: () => any): any|null {
	try {
		return fn();
	} catch {
		return null;
	}
}

function parse_cli_arguments() {
	const argv = process.argv.slice(2);
	const args = {} as Record<string, any>;

	if (argv.length === 0) {
		print_usage();
		panic('No {input} file or directory specified.');
	}

	args.input = argv.shift() as string;

	for (const arg of argv) {
		const [key_raw, value_raw] = arg.split('=');

		const key = key_raw.toLowerCase();
		const value = value_raw === undefined ? 'true' : value_raw.trim();
	
		if (key == 'ext') {
			args.ext = value.split(',').map((ext: string) => ext.trim().toLowerCase());
		} else if (key === 'quality') {
			const quality = parseInt(value);
			if (isNaN(quality) || quality < 0 || quality > 100)
				panic('{quality} must be a number between {0} and {100}.');

			args.quality = quality;
		} else if (key === 'compression') {
			const compression = parseInt(value);
			if (isNaN(compression) || compression < 0 || compression > 6)
				panic('{compression} must be a number between {0} and {6}.');

			args.compression = compression;
		} else if (key === 'scale') {
			const scale = parseFloat(value);
			if (isNaN(scale) || scale <= 0)
				panic('{scale} must be a number greater than {0}.');

			args.scale = scale;
		} else if (key === 'width' || key === 'height') {
			const dimension = value.toLowerCase();
			if (dimension !== 'auto' && dimension !== 'source') {
				const width_value = parseInt(value);
				if (isNaN(width_value) || width_value <= 0)
					panic('{width} must be a number greater than {0}.');

				args[key] = width_value;
			} else {
				args[key] = dimension;
			}
		} else {
			args[key] = value;
		}
	}

	return args;
}

const input_files = [];
const args = parse_cli_arguments();

const resolved_input_path = path.resolve(args.input);
const input_stat = safe(() => fs.statSync(resolved_input_path));

if (input_stat === null)
	panic(`Cannot read input directory {${resolved_input_path}}`);

if (input_stat.isDirectory()) {
	const files = safe(() => fs.readdirSync(resolved_input_path));

	if (files === null)
		panic(`Could not read files from directory {${resolved_input_path}}.`);

	for (const file of files)
		if (args.ext === undefined || args.ext.includes(path.extname(file).toLowerCase().slice(1)))
			input_files.push(path.join(resolved_input_path, file));
} else {
	input_files.push(resolved_input_path);
}

for (const input_file of input_files) {
	const output_basename = path.basename(input_file, path.extname(input_file)) + '.webp';
	const output_path = path.join(args.out || path.dirname(input_file), output_basename);

	print_info(`Converting {${input_file}} to {${output_path}}...`);

	const exif_args = ['exiftool', '-json', '-n', input_file];
	print_info(`{exiftool} > ${exif_args.join(' ')}`);

	const exif_proc = Bun.spawn(exif_args);
	await exif_proc.exited;

	let has_exif = exif_proc.exitCode === 0;

	if (!has_exif)
		print_error(`Failed to read exif data from {${input_file}}, composition disabled.`);

	const exif_json = (await Bun.readableStreamToJSON(exif_proc.stdout))[0];

	const ffmpeg_args = [
		'ffmpeg',
		'-noautorotate', // prevent automatic rotation (handled manually)
		'-i', input_file,
		'-y', // overwrite output file
		'-vcodec', 'libwebp', // webp codec
	];

	// lossless/lossy options
	ffmpeg_args.push('-lossless', args.lossless ? '1' : '0');
	if (args.lossless)
		ffmpeg_args.push('-compression_level', (args.compression || 6).toString()); // lossless compression level (default 6)
	else
		ffmpeg_args.push('-q:v', (args.quality || 75).toString()); // lossy compression quality (default 75)

	/*
		exif orientation values:
		1: Normal (0 degrees: top is top, left is left)
		2: Flipped horizontally
		3: Rotated 180 degrees
		4: Flipped vertically
		5: Rotated 90 degrees CW and flipped vertically
		6: Rotated 90 degrees CW
		7: Rotated 90 degrees CW and flipped horizontally
		8: Rotated 270 degrees CW (or 90 degrees CCW)

		ffmpeg transpose values:
		0 = 90 degrees counterclockwise and vertical flip (default)
		1 = 90 degrees clockwise
		2 = 90 degrees counterclockwise
		3 = 90 degrees clockwise and vertical flip
	*/

	if (has_exif) {
		const video_filter = [];

		// create video filter based on orientation from exif
		if (exif_json.Orientation !== undefined) {
			const orientation = exif_json.Orientation;

			if (orientation === 2) // Flipped horizontally
				video_filter.push('hflip');
			else if (orientation === 4) // Flipped vertically
				video_filter.push('vflip');
			else if (orientation === 3) // Rotated 180 degrees
				video_filter.push('transpose=1,transpose=1');
			else if (orientation === 5) // Rotated 90 degrees CW and flipped vertically
				video_filter.push('tranapose=3');
			else if (orientation === 6) // Rotated 90 degrees CW
				video_filter.push('transpose=1');
			else if (orientation === 7) // Rotated 90 degrees CW and flipped horizontally
				video_filter.push('transpose=1,hflip');
			else if (orientation === 8) // Rotated 270 degrees CW (or 90 degrees CCW)
				video_filter.push('transpose=2');
		}

		if (args.scale)
			video_filter.push('scale=iw*' + args.scale + ':ih*' + args.scale);

		if (args.width || args.height) {
			const width = args.width === 'auto' || args.width === undefined ? -1 : args.width === 'source' ? 'iw' : args.width;
			const height = args.height === 'auto' || args.height === undefined ? -1 : args.height === 'source' ? 'ih' : args.height;

			if (args.crop) {
				const crop_x = args.centerh || args.center ? `(iw-${width})/2` : 0;
				const crop_y = args.centerv || args.center ? `(ih-${height})/2` : 0;


				video_filter.push(`crop=${width}:${height}:${crop_x}:${crop_y}`);
			} else {
				video_filter.push(`scale=${width}:${height}`);
			}
		}

		if (video_filter.length > 0)
			ffmpeg_args.push('-vf', video_filter.join(','));
	}

	// output path
	fs.mkdirSync(path.dirname(output_path), { recursive: true });
	ffmpeg_args.push(output_path);

	print_info(`{ffmpeg} > ${ffmpeg_args.join(' ')}`);

	const std_mode = args.verbose ? 'inherit' : 'ignore';
	const ffmpeg_proc = Bun.spawn(ffmpeg_args, { stdout: std_mode, stderr: std_mode });
	await ffmpeg_proc.exited;

	if (ffmpeg_proc.exitCode !== 0)
		print_error(`Failed to convert {${input_file}} (ffmpeg)`);
}