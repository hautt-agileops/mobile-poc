using UnityEngine;

namespace Fighter3D
{
    // Perspective camera that frames both fighters: sits back along -Z and up on +Y, looks at the
    // midpoint, and pulls back as the fighters separate. Smoothed, with a decaying shake on impact.
    public class CameraRig3D
    {
        readonly Camera cam;
        float shake;

        public CameraRig3D(Camera c)
        {
            cam = c;
            cam.orthographic = false;
            cam.fieldOfView = 50f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 200f;
        }

        public void Frame(Transform a, Transform b, float dt)
        {
            Vector3 mid = (a.position + b.position) * 0.5f;
            float sep = Vector3.Distance(a.position, b.position);
            // distance back grows with separation so both stay in frame
            float dist = Mathf.Clamp(5.5f + sep * 0.55f, 6f, 12f);
            float backHeight = 2.6f + sep * 0.12f;

            var target = mid + new Vector3(0, backHeight, -dist);
            var pos = Vector3.Lerp(
                cam.transform.position,
                target,
                1f - Mathf.Exp(-9f * dt)
            );
            if (shake > 0)
            {
                shake -= dt * 4f;
                pos += (Vector3)(Random.insideUnitSphere * shake * 0.18f);
            }
            cam.transform.position = pos;

            var look = mid + new Vector3(0, 1.1f, 0);
            var wantRot = Quaternion.LookRotation(look - pos, Vector3.up);
            cam.transform.rotation = Quaternion.Slerp(
                cam.transform.rotation,
                wantRot,
                1f - Mathf.Exp(-9f * dt)
            );
        }

        public void Shake(float amt)
        {
            shake = Mathf.Max(shake, amt);
        }
    }
}
