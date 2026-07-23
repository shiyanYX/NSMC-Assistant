package com.nsmc.assistant

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.google.gson.JsonObject

object RustBridge {
    init {
        System.loadLibrary("backend_rust")
    }

    private external fun nativeLogin(username: String, password: String): String
    private external fun nativeGetScore(username: String, password: String, name: String, term: String): String
    private external fun nativeEvaluationList(username: String, password: String): String
    private external fun nativeEvaluationSubmit(username: String, password: String, teacherJson: String, doSubmit: Boolean): String
    private external fun nativeXg2Login(username: String, password: String): String
    private external fun nativeXg2EditForm(username: String): String
    private external fun nativeXg2Submit(username: String, formFieldsJson: String): String

    private fun parseResult(json: String): Triple<Boolean, JsonObject?, String> {
        val obj = JsonParser.parseString(json).asJsonObject
        val success = obj.get("success")?.asBoolean ?: false
        val data = obj.get("data")?.asJsonObject
        val message = obj.get("message")?.asString ?: ""
        return Triple(success, data, message)
    }

    private fun checkResult(json: String, errorPrefix: String): JsonObject {
        val (success, data, message) = parseResult(json)
        if (!success) throw Exception(message.ifEmpty { "${errorPrefix}失败" })
        return data ?: throw Exception("返回数据为空")
    }

    @JvmStatic
    fun login(username: String, password: String): JsonObject =
        checkResult(nativeLogin(username, password), "登录")

    @JvmStatic
    fun getScore(username: String, password: String, name: String? = null, term: String? = null): JsonObject =
        checkResult(nativeGetScore(username, password, name ?: "", term ?: ""), "获取成绩")

    @JvmStatic
    fun evaluationList(username: String, password: String): JsonObject =
        checkResult(nativeEvaluationList(username, password), "获取评教列表")

    @JvmStatic
    fun evaluationSubmit(username: String, password: String, teacherJson: String, doSubmit: Boolean): JsonObject =
        checkResult(nativeEvaluationSubmit(username, password, teacherJson, doSubmit), "提交评教")

    @JvmStatic
    fun xg2Login(username: String, password: String): JsonObject =
        checkResult(nativeXg2Login(username, password), "学工系统登录")

    @JvmStatic
    fun xg2EditForm(username: String): JsonObject =
        checkResult(nativeXg2EditForm(username), "获取编辑页")

    @JvmStatic
    fun xg2Submit(username: String, formFields: Map<String, String>): String {
        val json = nativeXg2Submit(username, Gson().toJson(formFields))
        val (success, _, message) = parseResult(json)
        if (!success) throw Exception(message.ifEmpty { "提交失败" })
        return message
    }
}
