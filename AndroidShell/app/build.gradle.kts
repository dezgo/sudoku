import java.util.Properties

// The store app is now a thin shell (Trusted Web Activity) around
// https://sudokucrew.com/play — every web deploy reaches store players with
// no store release. Same package as the old native app (in ../Android), so
// it ships as an update to the existing Play listing.

plugins {
    id("com.android.application")
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(keystorePropsFile.inputStream())
}

android {
    namespace = "com.derekgillett.sudoku"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.derekgillett.sudoku"
        minSdk = 26
        targetSdk = 36
        // Must stay above the native app's last versionCode (11).
        versionCode = 12
        versionName = "2.0.0"
    }

    signingConfigs {
        create("release") {
            if (keystorePropsFile.exists()) {
                storeFile = rootProject.file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePropsFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
    // Only to read the sign-in the old native app saved, once.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
