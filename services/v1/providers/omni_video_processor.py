import os
import subprocess
import ffmpeg

def get_duration(file_path):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    return float(result.stdout.strip())

def concatenate_videos(video_paths, output_path, fade_duration=0.5):
    """
    Склеивает видео с плавным переходом (crossfade).
    """
    print(f"[*] Начинаем склейку {len(video_paths)} видео с плавным переходом...")
    if len(video_paths) == 0:
        return
        
    if len(video_paths) == 1:
        subprocess.run(["ffmpeg", "-y", "-i", video_paths[0], "-c", "copy", output_path], check=True)
        return

    durations = [get_duration(v) for v in video_paths]
    
    inputs = []
    for v in video_paths:
        inputs.extend(["-i", v])
        
    filter_complex = ""
    last_v = "[0:v]"
    last_a = "[0:a]"
    current_offset = durations[0] - fade_duration
    
    for i in range(1, len(video_paths)):
        next_v = f"[{i}:v]"
        next_a = f"[{i}:a]"
        out_v = f"[v{i}]"
        out_a = f"[a{i}]"
        
        filter_complex += f"{last_v}{next_v}xfade=transition=fade:duration={fade_duration}:offset={current_offset}{out_v};"
        filter_complex += f"{last_a}{next_a}acrossfade=d={fade_duration}{out_a};"
        
        last_v = out_v
        last_a = out_a
        current_offset += (durations[i] - fade_duration)
        
    filter_complex = filter_complex.rstrip(';')
    
    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", last_v, "-map", last_a, output_path]
    
    print(f"[*] Запускаем FFmpeg с фильтром xfade...")
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"[*] Склейка завершена! Итоговый файл: {output_path}")
    except subprocess.CalledProcessError as e:
        print(f"[!] Ошибка FFmpeg:\n{e.stderr}")
        raise e

def extract_last_frame(video_path, output_image_path):
    """
    Извлекает последний кадр из видео.
    """
    print(f"[*] Извлечение последнего кадра из {video_path}...")
    try:
        (
            ffmpeg
            .input(video_path, sseof='-0.5')
            .output(output_image_path, update=1, vframes=30)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
        print(f"[*] Кадр сохранен: {output_image_path}")
        return output_image_path
    except ffmpeg.Error as e:
        print(f"[!] Ошибка FFmpeg при извлечении кадра:\n{e.stderr.decode('utf-8')}")
        raise e
