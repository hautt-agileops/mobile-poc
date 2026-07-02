using UnityEngine;

namespace Fighter
{
    public class CameraRig
    {
        readonly Camera cam;
        float shake;

        public CameraRig(Camera c)
        {
            cam = c;
            cam.orthographic = true;
        }

        public void Frame(Transform a, Transform b, float dt)
        {
            float midX = (a.position.x + b.position.x) * 0.5f;
            float dist = Mathf.Abs(a.position.x - b.position.x);
            float size = Mathf.Clamp(3.2f + dist * 0.32f, 4.2f, 6.2f);
            var target = new Vector3(Mathf.Clamp(midX, -3.5f, 3.5f), 2.2f, -10f);
            var pos = Vector3.Lerp(cam.transform.position, target, 1f - Mathf.Exp(-10f * dt));
            cam.orthographicSize = Mathf.Lerp(cam.orthographicSize, size, 1f - Mathf.Exp(-8f * dt));
            if (shake > 0)
            {
                shake -= dt * 4f;
                pos += (Vector3)(Random.insideUnitCircle * shake * 0.25f);
            }
            cam.transform.position = pos;
        }

        public void Shake(float amt)
        {
            shake = Mathf.Max(shake, amt);
        }
    }
}
