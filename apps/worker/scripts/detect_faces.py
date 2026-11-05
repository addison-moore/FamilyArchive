"""MediaPipe face detection.

Called by the TypeScript worker:  python3 detect_faces.py <image.png>
Prints a JSON array of face boxes with coordinates normalized to 0–1,
plus the detector confidence.
"""

import json
import os
import sys

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: detect_faces.py <image>", file=sys.stderr)
        sys.exit(2)
    model_path = os.environ.get("FACE_MODEL_PATH", "/opt/models/blaze_face_short_range.tflite")

    image = mp.Image.create_from_file(sys.argv[1])
    options = vision.FaceDetectorOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        min_detection_confidence=0.5,
    )
    with vision.FaceDetector.create_from_options(options) as detector:
        result = detector.detect(image)

    boxes = []
    for detection in result.detections:
        bbox = detection.bounding_box
        confidence = detection.categories[0].score if detection.categories else None
        # A face at the frame's edge can extend past it. Clamp the corners rather
        # than the origin and size separately, which moved the box off the face.
        left = max(0.0, bbox.origin_x / image.width)
        top = max(0.0, bbox.origin_y / image.height)
        right = min(1.0, (bbox.origin_x + bbox.width) / image.width)
        bottom = min(1.0, (bbox.origin_y + bbox.height) / image.height)
        boxes.append(
            {
                "x": left,
                "y": top,
                "width": right - left,
                "height": bottom - top,
                "confidence": round(confidence, 4) if confidence is not None else None,
            }
        )
    print(json.dumps(boxes))


if __name__ == "__main__":
    main()
