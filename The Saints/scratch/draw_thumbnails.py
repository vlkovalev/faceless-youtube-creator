import os
from PIL import Image, ImageDraw, ImageFont

def add_text_to_thumbnail(image_path, output_path, lines, sec_num):
    # Load image
    if not os.path.exists(image_path):
        print(f"Error: Image not found at {image_path}")
        return
    
    img = Image.open(image_path).convert("RGBA")
    txt_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    # Fonts
    font_path_bold = "C:\\Windows\\Fonts\\impact.ttf"
    font_path_regular = "C:\\Windows\\Fonts\\arialbd.ttf"
    
    if not os.path.exists(font_path_bold):
        font_path_bold = "C:\\Windows\\Fonts\\arialbd.ttf"
    if not os.path.exists(font_path_regular):
        font_path_regular = "C:\\Windows\\Fonts\\arial.ttf"
        
    font_size_main = 140
    font_size_sec = 60
    
    font_main = ImageFont.truetype(font_path_bold, font_size_main)
    font_sec = ImageFont.truetype(font_path_regular, font_size_sec)
    
    # 1. Draw a dark gradient/overlay on the left side to ensure high contrast
    # A soft black overlay from left to right, fading out
    width, height = img.size
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    o_draw = ImageDraw.Draw(overlay)
    for x in range(int(width * 0.5)):
        alpha = int(180 * (1.0 - (x / (width * 0.5))))
        o_draw.line([(x, 0), (x, height)], fill=(0, 0, 0, alpha))
    
    # Composite overlay onto main image
    img = Image.alpha_composite(img, overlay)
    
    # 2. Draw text with thick black outline
    x_pos = 80
    y_pos = 180
    line_spacing = 15
    
    # Draw main lines
    for i, line in enumerate(lines):
        # Outline
        outline_width = 8
        for dx in range(-outline_width, outline_width + 1):
            for dy in range(-outline_width, outline_width + 1):
                if dx*dx + dy*dy <= outline_width*outline_width:
                    draw.text((x_pos + dx, y_pos + dy), line, font=font_main, fill=(0, 0, 0, 255))
        
        # Text fill (yellow/white alternating or specific yellow accent)
        fill_color = (255, 230, 0, 255) if i == 0 else (255, 255, 255, 255)
        draw.text((x_pos, y_pos), line, font=font_main, fill=fill_color)
        
        # Get line height
        bbox = draw.textbbox((x_pos, y_pos), line, font=font_main)
        y_pos += (bbox[3] - bbox[1]) + line_spacing
        
    # Draw Sec. marker (e.g. SEC. 7)
    y_pos += 20
    sec_text = f"SEC. {sec_num}"
    
    # Outline for Sec. marker
    outline_width = 4
    for dx in range(-outline_width, outline_width + 1):
        for dy in range(-outline_width, outline_width + 1):
            if dx*dx + dy*dy <= outline_width*outline_width:
                draw.text((x_pos + dx, y_pos + dy), sec_text, font=font_sec, fill=(0, 0, 0, 255))
                
    draw.text((x_pos, y_pos), sec_text, font=font_sec, fill=(255, 230, 0, 255))
    
    # Composite text layer onto image
    final_img = Image.alpha_composite(img, txt_layer).convert("RGB")
    final_img.save(output_path, "PNG")
    print(f"Successfully saved thumbnail to: {output_path}")

# Run operations
assets_dir = "c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean\\Corporate Shadows\\assets"

# Video 7: The Silent Killer
add_text_to_thumbnail(
    os.path.join(assets_dir, "youtube_thumbnail_video_7.png"),
    os.path.join(assets_dir, "youtube_thumbnail_video_7.png"),
    ["SILENT", "KILLER"],
    "7"
)

# Video 8: The Company That Patented Nature
add_text_to_thumbnail(
    os.path.join(assets_dir, "youtube_thumbnail_video_8.png"),
    os.path.join(assets_dir, "youtube_thumbnail_video_8.png"),
    ["PATENTED", "NATURE"],
    "8"
)
