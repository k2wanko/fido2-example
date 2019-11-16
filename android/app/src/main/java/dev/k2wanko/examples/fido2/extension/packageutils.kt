package dev.k2wanko.examples.fido2.extension

import android.content.Context
import android.content.pm.PackageManager
import android.util.Base64
import java.security.MessageDigest

fun Context.getApkSigSha256(): String = run {
        val info = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        for (signature in info.signingInfo.apkContentsSigners) {
            val md = MessageDigest.getInstance ("SHA256")
            md.update(signature.toByteArray())
            return Base64.encodeToString(md.digest(), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        }
    return ""
}