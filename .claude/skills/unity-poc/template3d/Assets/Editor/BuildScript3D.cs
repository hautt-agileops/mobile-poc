#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Fighter3D.EditorTools
{
    // Headless WebGL build for the 3D brawler. Invoked via:
    //   Unity -batchmode -quit -projectPath <p> -buildTarget WebGL \
    //         -executeMethod Fighter3D.EditorTools.BuildScript.BuildWebGL -logFile -
    public static class BuildScript
    {
        public static void RunPlaytest()
        {
            int code = Playtest_Internal();
            EditorApplication.Exit(code);
        }

        // Discover the roster WITHOUT hardcoding the Game class name: reflect on a
        // `public static List<CharacterDef3D> BuildRoster()`. RuntimeInitialize hooks don't fire
        // in -executeMethod batchmode, so Roster3D.All isn't populated here.
        static System.Collections.Generic.List<global::Fighter3D.CharacterDef3D> DiscoverRoster()
        {
            var want = typeof(System.Collections.Generic.List<global::Fighter3D.CharacterDef3D>);
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (System.Reflection.ReflectionTypeLoadException e) { types = e.Types; }
                if (types == null)
                    continue;
                foreach (var t in types)
                {
                    if (t == null)
                        continue;
                    var m = t.GetMethod(
                        "BuildRoster",
                        System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static,
                        null, Type.EmptyTypes, null
                    );
                    if (m != null && want.IsAssignableFrom(m.ReturnType))
                        return (System.Collections.Generic.List<global::Fighter3D.CharacterDef3D>)
                            m.Invoke(null, null);
                }
            }
            return null;
        }

        static int Playtest_Internal()
        {
            try
            {
                var roster = DiscoverRoster();
                if (roster == null || roster.Count < 2)
                {
                    Console.Error.WriteLine(
                        "[Playtest] no `public static List<CharacterDef3D> BuildRoster()` found in any "
                            + "game assembly, or roster < 2 fighters"
                    );
                    return 1;
                }

                bool allOk = true;
                for (int i = 0; i < roster.Count; i++)
                for (int j = 0; j < roster.Count; j++)
                {
                    if (i == j)
                        continue;
                    var res = global::Fighter3D.Playtest3D.RunMatch(roster[i], roster[j]);
                    Debug.Log($"[Playtest] {roster[i].displayName} vs {roster[j].displayName}\n{res}");
                    if (!res.ok)
                        allOk = false;
                }
                Debug.Log("[Playtest] OVERALL " + (allOk ? "PASS" : "FAIL"));
                if (!allOk)
                    Console.Error.WriteLine("[Playtest] FAILED");
                return allOk ? 0 : 1;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("[Playtest] EXCEPTION: " + e);
                return 2;
            }
        }

        public static void BuildWebGL()
        {
            try
            {
                if (!HasArg("-skipPlaytest"))
                {
                    int pt = Playtest_Internal();
                    if (pt != 0)
                    {
                        Console.Error.WriteLine("[BuildScript] playtest gate failed, aborting build");
                        EditorApplication.Exit(pt);
                        return;
                    }
                }

                string outDir = GetArg("-outputPath") ?? "Build/WebGL";
                string product = GetArg("-productName") ?? "3D Arena";

                string sceneDir = "Assets/Scenes";
                Directory.CreateDirectory(sceneDir);
                string scenePath = sceneDir + "/Main.unity";
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, scenePath);
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(scenePath, true) };

                PlayerSettings.companyName = "Arena Studio";
                PlayerSettings.productName = product;
                PlayerSettings.colorSpace = ColorSpace.Gamma; // simplest WebGL path; fine for a POC
                PlayerSettings.runInBackground = true;
                PlayerSettings.SetPropertyInt("activeInputHandler", 2, BuildTargetGroup.Standalone);

                PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
                PlayerSettings.WebGL.decompressionFallback = false;
                PlayerSettings.WebGL.dataCaching = true;
                PlayerSettings.WebGL.template = "APPLICATION:Default";
                PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;
                // Runtime AddComponent + glTFast reflection => keep stripping minimal; link.xml backstops.
                PlayerSettings.SetManagedStrippingLevel(BuildTargetGroup.WebGL, ManagedStrippingLevel.Minimal);
                PlayerSettings.stripEngineCode = false;

                // PrimitiveArt3D resolves "Standard" via Shader.Find at runtime; a shader only
                // referenced at runtime is stripped from the build (-> magenta/invisible
                // primitives). Force it into Always-Included Shaders so it survives.
                EnsureAlwaysIncluded("Standard");

                var opts = new BuildPlayerOptions
                {
                    scenes = new[] { scenePath },
                    locationPathName = outDir,
                    target = BuildTarget.WebGL,
                    targetGroup = BuildTargetGroup.WebGL,
                    options = BuildOptions.None,
                };

                var report = BuildPipeline.BuildPlayer(opts);
                var sum = report.summary;
                Debug.Log($"[BuildScript] result={sum.result} size={sum.totalSize} errors={sum.totalErrors} out={outDir}");
                if (sum.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                {
                    Console.Error.WriteLine("[BuildScript] BUILD FAILED: " + sum.result);
                    EditorApplication.Exit(1);
                }
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("[BuildScript] EXCEPTION: " + e);
                EditorApplication.Exit(2);
            }
        }

        // Append a shader to ProjectSettings/GraphicsSettings m_AlwaysIncludedShaders if absent,
        // so a runtime-only Shader.Find() resolves in the player build.
        static void EnsureAlwaysIncluded(string shaderName)
        {
            var shader = Shader.Find(shaderName);
            if (shader == null)
                return;
            var gs = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>("ProjectSettings/GraphicsSettings.asset");
            if (gs == null)
                return;
            var so = new SerializedObject(gs);
            var arr = so.FindProperty("m_AlwaysIncludedShaders");
            if (arr == null)
                return;
            for (int i = 0; i < arr.arraySize; i++)
                if (arr.GetArrayElementAtIndex(i).objectReferenceValue == shader)
                    return;
            int idx = arr.arraySize;
            arr.InsertArrayElementAtIndex(idx);
            arr.GetArrayElementAtIndex(idx).objectReferenceValue = shader;
            so.ApplyModifiedProperties();
            Debug.Log("[BuildScript] ensured Always-Included shader: " + shaderName);
        }

        static string GetArg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == name)
                    return args[i + 1];
            return null;
        }

        static bool HasArg(string name)
        {
            foreach (var a in Environment.GetCommandLineArgs())
                if (a == name)
                    return true;
            return false;
        }
    }
}
#endif
