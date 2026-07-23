package com.nsmc.assistant.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.JsonParser
import com.nsmc.assistant.LoginState
import com.nsmc.assistant.RustBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ScoreItem(
    val term: String, val code: String, val name: String,
    val score: String, val credit: Float, val gpa: Float,
    val nature: String, val attr: String, val hours: String
)

@Composable
fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ScoreBadge(score: String, modifier: Modifier = Modifier) {
    val num = score.toFloatOrNull()
    val color = when {
        num == null -> MaterialTheme.colorScheme.outline
        num >= 90 -> Color(0xFF2D9F4E)
        num >= 80 -> Color(0xFF3A86FF)
        num >= 60 -> Color(0xFF6C757D)
        else -> Color(0xFFDC3545)
    }
    Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small, modifier = modifier) {
        Text(score, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = color)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScoreScreen(loginState: LoginState) {
    var scores by remember { mutableStateOf<List<ScoreItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var selectedTerm by remember { mutableStateOf("all") }
    var terms by remember { mutableStateOf(listOf("all")) }
    var attrFilter by remember { mutableStateOf("全部") }
    val scope = rememberCoroutineScope()

    fun fetchScores(fetchAll: Boolean) {
        scope.launch {
            loading = true; error = ""
            try {
                val term = if (fetchAll) "" else if (selectedTerm != "all") selectedTerm else ""
                val data = withContext(Dispatchers.IO) {
                    RustBridge.getScore(loginState.username, loginState.password, loginState.name, term.ifEmpty { null })
                }
                val arr = data.getAsJsonArray("scores")
                val list = arr?.map { el ->
                    val obj = el.asJsonObject
                    ScoreItem(
                        term = obj.get("开课学期")?.asString ?: obj.get("学期")?.asString ?: "",
                        code = obj.get("课程编号")?.asString ?: "",
                        name = obj.get("课程名称")?.asString ?: obj.get("课 程名称")?.asString ?: "",
                        score = obj.get("成绩")?.asString ?: "0",
                        credit = obj.get("学分")?.asFloat ?: 0f,
                        gpa = obj.get("绩点")?.asFloat ?: 0f,
                        nature = obj.get("考试性质")?.asString ?: "",
                        attr = obj.get("课程属性")?.asString ?: "",
                        hours = obj.get("总学时")?.asString ?: "0"
                    )
                } ?: emptyList()
                scores = list
                terms = listOf("all") + list.map { it.term }.distinct().sorted().reversed()
            } catch (e: Exception) { error = e.message ?: "获取成绩失败" }
            finally { loading = false }
        }
    }

    LaunchedEffect(Unit) { fetchScores(false) }

    val filtered = scores.filter { s ->
        (selectedTerm == "all" || s.term == selectedTerm) &&
        (attrFilter == "全部" || s.attr == attrFilter)
    }
    val totalCredit = filtered.sumOf { it.credit.toDouble() }
    val avgGpa = filtered.filter { it.gpa > 0 }.let { list ->
        if (list.isEmpty()) 0.0 else list.sumOf { it.gpa.toDouble() } / list.size
    }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCard("总学分", "%.2f".format(totalCredit), Modifier.weight(1f))
            StatCard("平均绩点", "%.2f".format(avgGpa), Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(
                selected = false,
                onClick = { fetchScores(true) },
                label = { Text("获取全部", fontSize = 12.sp) }
            )
            FilterChip(
                selected = false,
                onClick = { fetchScores(false) },
                label = { Text("刷新", fontSize = 12.sp) }
            )
        }
        Spacer(Modifier.height(8.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("学期", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            terms.take(5).forEach { t ->
                FilterChip(
                    selected = selectedTerm == t,
                    onClick = { selectedTerm = t },
                    label = { Text(if (t == "all") "全部" else t.takeLast(9), fontSize = 11.sp) }
                )
            }
        }

        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (filtered.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("暂无成绩数据", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            Spacer(Modifier.height(8.dp))
            Card(Modifier.fillMaxWidth()) {
                val scrollState = rememberScrollState()
                Column(Modifier.horizontalScroll(scrollState)) {
                    Row(Modifier.background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Text("#", Modifier.width(28.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("课程名称", Modifier.width(140.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("成绩", Modifier.width(50.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("学分", Modifier.width(40.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("绩点", Modifier.width(45.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    LazyColumn {
                        items(filtered.withIndex().toList()) { (i, s) ->
                            Row(Modifier.padding(horizontal = 8.dp, vertical = 5.dp)) {
                                Text("${i+1}", Modifier.width(28.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(s.name, Modifier.width(140.dp), fontSize = 12.sp, maxLines = 1)
                                ScoreBadge(s.score, Modifier.width(50.dp))
                                Text(s.credit.toString(), Modifier.width(40.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(if (s.gpa > 0) "%.2f".format(s.gpa) else "—", Modifier.width(45.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
