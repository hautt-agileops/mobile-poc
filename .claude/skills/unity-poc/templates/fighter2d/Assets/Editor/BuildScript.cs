#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Fighter.EditorTools
{
    // Headless WebGL build. Invoked via:
    //   Unity -batchmode -quit -projectPath <p> -buildTarget WebGL \
    //         -executeMethod Fighter.EditorTools.BuildScript.BuildWebGL -logFile -
    public static class BuildScript
    {
        // Standalone headless playtest gate. Exits 1 on failure.
        //   -executeMethod Fighter.EditorTools.BuildScript.RunPlaytest
        public static void RunPlaytest()
        {
            int code = Playtest_Internal();
            EditorApplication.Exit(code);
        }

        // Find the job-specific roster WITHOUT hardcoding the Game class name. The Game layer
        // is the only file that changes per brief, so we discover its
        // `public static List<CharacterDef> BuildRoster()` by reflection instead of coupling
        // the reusable Editor layer to one game (e.g. BloodBloomProtocol). RuntimeInitialize
        // hooks don't fire in -executeMethod batchmode, so we can't lean on Roster.All here.
        static System.Collections.Generic.List<global::Fighter.CharacterDef> DiscoverRoster()
        {
            var want = typeof(System.Collections.Generic.List<global::Fighter.CharacterDef>);
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
                        return (System.Collections.Generic.List<global::Fighter.CharacterDef>)
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
                        "[Playtest] no `public static List<CharacterDef> BuildRoster()` found in any "
                            + "game assembly, or roster < 2 fighters"
                    );
                    return 1;
                }

                bool allOk = true;
                // Every ordered pair must produce a real, KO-ending match.
                for (int i = 0; i < roster.Count; i++)
                for (int j = 0; j < roster.Count; j++)
                {
                    if (i == j)
                        continue;
                    var res = global::Fighter.Playtest.RunMatch(roster[i], roster[j]);
                    Debug.Log(
                        $"[Playtest] {roster[i].displayName} vs {roster[j].displayName}\n{res}"
                    );
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
                // Gate: refuse to build a broken game. Skip with -skipPlaytest.
                if (!HasArg("-skipPlaytest"))
                {
                    int pt = Playtest_Internal();
                    if (pt != 0)
                    {
                        Console.Error.WriteLine(
                            "[BuildScript] playtest gate failed, aborting build"
                        );
                        EditorApplication.Exit(pt);
                        return;
                    }
                }

                string outDir = GetArg("-outputPath") ?? "Build/WebGL";
                string product = GetArg("-productName") ?? "Blood Bloom Protocol";

                // 1. boot scene (empty — game self-builds via RuntimeInitializeOnLoadMethod)
                string sceneDir = "Assets/Scenes";
                Directory.CreateDirectory(sceneDir);
                string scenePath = sceneDir + "/Main.unity";
                var scene = EditorSceneManager.NewScene(
                    NewSceneSetup.EmptyScene,
                    NewSceneMode.Single
                );
                EditorSceneManager.SaveScene(scene, scenePath);
                EditorBuildSettings.scenes = new[]
                {
                    new EditorBuildSettingsScene(scenePath, true),
                };

                // 2. player settings (WebGL-safe, legacy input)
                PlayerSettings.companyName = "BBP Studio";
                PlayerSettings.productName = product;
                PlayerSettings.colorSpace = ColorSpace.Gamma;
                PlayerSettings.runInBackground = true;
                // 2 = Both (legacy UnityEngine.Input + new system both work)
                PlayerSettings.SetPropertyInt("activeInputHandler", 2, BuildTargetGroup.Standalone);

                PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled; // plain static hosting
                PlayerSettings.WebGL.decompressionFallback = false;
                PlayerSettings.WebGL.dataCaching = true;
                PlayerSettings.WebGL.template = "APPLICATION:Default";
                PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;
                // This game builds every component via runtime AddComponent, so the stripper
                // can't see them used. Keep stripping minimal + don't strip engine code; the
                // Assets/link.xml preserve list backstops the uGUI/EventSystem classes.
                PlayerSettings.SetManagedStrippingLevel(
                    BuildTargetGroup.WebGL,
                    ManagedStrippingLevel.Minimal
                );
                PlayerSettings.stripEngineCode = false;

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
                Debug.Log(
                    $"[BuildScript] result={sum.result} size={sum.totalSize} errors={sum.totalErrors} out={outDir}"
                );
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
